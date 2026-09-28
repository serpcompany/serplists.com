// Profiles D1 cost (rows read and written) per API request on a large synthetic dataset.
//   pnpm run d1:profile                # default volume (about 150k rows)
//   pnpm run d1:profile -- --scale 3   # 3x the volume
//   pnpm run d1:profile -- --reuse     # reuse the last dataset (skips the rebuild)
// Builds an isolated local D1 in .wrangler/d1-profile-state, runs the API with
// D1_PROFILE=true, replays a scripted workload, and writes tmp/d1-profile/report.md.
// Local D1 reports rows_read/rows_written with production semantics (rows scanned).
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { getPlatformProxy } from "wrangler";
import { createServer } from "node:net";
import { z } from "zod";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const persistPath = ".wrangler/d1-profile-state";
const outDir = path.join(repoRoot, "tmp", "d1-profile");
const scaleArg = process.argv.indexOf("--scale");
const scale = scaleArg >= 0 ? Number(process.argv[scaleArg + 1]) : 1;
const isWindows = process.platform === "win32";
const reuse = process.argv.includes("--reuse") && existsSync(path.join(repoRoot, persistPath));

type QueryRecord = { sql: string; rowsRead: number; rowsWritten: number; rowsReturned: number; durationMs: number };
type Scenario = { name: string; actor: "anon" | "admin" | "john"; method?: string; path: string; body?: unknown };

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("No free port"))));
    });
  });

const resourceSchema = z.object({
  sections: z.array(z.unknown()).optional(),
  version: z.number().optional(),
  revision: z.number().optional(),
});

function run(command: string, args: string[]) {
  execFileSync(command, args, { cwd: repoRoot, stdio: "inherit", shell: isWindows, env: { ...process.env, CI: "1" } });
}

// ---------------------------------------------------------------- dataset
const counts = {
  users: 2000 * scale,
  teams: 100 * scale,
  templates: 20000 * scale,
  runs: 40000 * scale,
  likes: 20000 * scale,
  auditEvents: 40000 * scale,
  invites: 5000 * scale,
  templateVersions: 20000 * scale,
  analytics: 50000 * scale,
};

const numbers = (limit: number) => `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${limit})`;
const items = `'[{"id":"s1","title":"Section","items":[{"id":"i1","title":"Task one"},{"id":"i2","title":"Task two"}]}]'`;
const categories = `CASE i % 6 WHEN 0 THEN '["Marketing"]' WHEN 1 THEN '["SEO"]' WHEN 2 THEN '["Operations"]' WHEN 3 THEN '["Travel"]' WHEN 4 THEN '["Home"]' ELSE '["Events"]' END`;
const syntheticUser = (expr: string) => `'synthetic-user-' || ((${expr}) % ${counts.users} + 1)`;

// Every 20th template belongs to the seeded Organization and every 50th to admin@test.com
// (user-1), so the signed-in scenarios see realistic volumes of their own data.
const syntheticSql = `
${numbers(counts.users)}
INSERT INTO users (id, email, name, username, email_verified, created_at, updated_at)
SELECT 'synthetic-user-' || i, 'synthetic' || i || '@example.test', 'Synthetic User ' || i,
  CASE WHEN i % 2 = 0 THEN 'synth_' || i END, 1, datetime('now', '-' || (i % 365) || ' days'), datetime('now') FROM n;

${numbers(counts.teams)}
INSERT INTO teams (id, name, slug, created_by_user_id, billing_owner_user_id, created_at, updated_at)
SELECT 'synthetic-team-' || i, 'Synthetic Org ' || i, 'synthetic-org-' || i, ${syntheticUser("i * 10")}, ${syntheticUser("i * 10")},
  datetime('now'), datetime('now') FROM n;

${numbers(counts.teams * 10)}
INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at, updated_at)
SELECT 'synthetic-member-' || i, 'synthetic-team-' || ((i - 1) / 10 + 1), ${syntheticUser("i")},
  CASE WHEN i % 10 = 1 THEN 'owner' ELSE 'editor' END, 'active', datetime('now'), datetime('now'), datetime('now') FROM n;

${numbers(counts.templates)}
INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, created_at, updated_at, slug,
  version, type, owner_type, team_id, created_by_user_id, deleted_at, content_version)
SELECT 'synthetic-template-' || i,
  CASE WHEN i % 20 = 0 OR i % 50 = 0 THEN 'user-1' ELSE ${syntheticUser("i")} END,
  'Synthetic template ' || i, 'A synthetic template for D1 profiling.', ${items},
  CASE WHEN i % 20 = 0 THEN 0 WHEN i % 5 < 2 THEN 1 ELSE 0 END, ${categories}, '["synthetic"]',
  datetime('now', '-' || (i % 500) || ' days'), datetime('now', '-' || (i % 100) || ' days'), 'synthetic-template-' || i,
  1, 'checklist', CASE WHEN i % 20 = 0 THEN 'team' ELSE 'user' END,
  CASE WHEN i % 20 = 0 THEN 'team-seed-growth' END,
  CASE WHEN i % 20 = 0 OR i % 50 = 0 THEN 'user-1' ELSE ${syntheticUser("i")} END,
  CASE WHEN i % 20 = 1 THEN datetime('now') END, 1 FROM n;

${numbers(counts.runs)}
INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, completed_at, created_at, updated_at,
  progress, is_public, share_token, team_id, created_by_user_id, deleted_at, template_version, revision, retired_items)
SELECT 'synthetic-run-' || i,
  CASE WHEN i % 40 = 0 THEN 'user-1' ELSE ${syntheticUser("i * 3")} END,
  'synthetic-template-' || (i % ${counts.templates} + 1), 'Synthetic run ' || i, ${items},
  CASE WHEN i % 3 = 0 THEN 'completed' ELSE 'in_progress' END,
  datetime('now', '-' || (i % 300) || ' days'), CASE WHEN i % 3 = 0 THEN datetime('now') END,
  datetime('now', '-' || (i % 300) || ' days'), datetime('now'),
  CASE WHEN i % 3 = 0 THEN 100 ELSE 50 END, CASE WHEN i % 50 = 0 THEN 1 ELSE 0 END,
  CASE WHEN i % 50 = 0 THEN 'synthetic-share-' || i END,
  CASE WHEN i % 10 = 0 THEN 'team-seed-growth' END,
  CASE WHEN i % 40 = 0 THEN 'user-1' ELSE ${syntheticUser("i * 3")} END,
  CASE WHEN i % 25 = 7 THEN datetime('now') END, 1, 1, '[]' FROM n;

${numbers(counts.likes)}
INSERT OR IGNORE INTO template_likes (user_id, template_id, created_at)
SELECT ${syntheticUser("i")}, 'synthetic-template-' || ((i * 7) % ${counts.templates} + 1), datetime('now') FROM n;

${numbers(counts.auditEvents)}
INSERT INTO audit_events (id, actor_user_id, subject_type, subject_id, resource_type, resource_id, action, created_at)
SELECT 'synthetic-audit-' || i, ${syntheticUser("i")},
  CASE WHEN i % 20 = 0 THEN 'team' ELSE 'user' END,
  CASE WHEN i % 20 = 0 THEN 'team-seed-growth' ELSE ${syntheticUser("i")} END,
  'template', 'synthetic-template-' || (i % ${counts.templates} + 1), 'template.updated',
  datetime('now', '-' || (i % 200) || ' days') FROM n;

-- Historical invites (expired, some revoked) for other emails: the incoming-invites lookup
-- must find a user's invites through the email index instead of scanning these.
${numbers(counts.invites)}
INSERT INTO team_invites (id, team_id, email, role, token_hash, invited_by_user_id, expires_at, revoked_at, created_at, updated_at)
SELECT 'synthetic-invite-' || i, 'synthetic-team-' || (i % ${counts.teams} + 1), 'invitee' || i || '@example.test', 'viewer',
  'synthetic-invite-hash-' || i, ${syntheticUser("i * 10")}, datetime('now', '-' || (i % 60 + 1) || ' days'),
  CASE WHEN i % 3 = 0 THEN datetime('now', '-' || (i % 60 + 2) || ' days') END,
  datetime('now', '-' || (i % 60 + 8) || ' days'), datetime('now') FROM n;

${numbers(counts.templateVersions)}
INSERT INTO template_versions (id, template_id, version, changed_by_user_id, subject_type, subject_id, snapshot_json, created_at)
SELECT 'synthetic-version-' || i, 'synthetic-template-' || (i % ${counts.templates} + 1), i / ${counts.templates} + 1,
  ${syntheticUser("i")}, 'user', ${syntheticUser("i")}, '{}', datetime('now', '-' || (i % 200) || ' days') FROM n;

${numbers(counts.analytics)}
INSERT INTO usage_analytics (id, user_id, action, resource_id, created_at)
SELECT 'synthetic-event-' || i, ${syntheticUser("i")}, 'template_view', 'synthetic-template-' || (i % ${counts.templates} + 1),
  datetime('now', '-' || (i % 90) || ' days') FROM n;
`;

function buildDatabase() {
  rmSync(path.join(repoRoot, persistPath), { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  run("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "serp-checklists-db", "--local", "--persist-to", persistPath]);
  run("pnpm", ["exec", "tsx", "scripts/data/local-d1-data.ts", "seed-test", "--persist-to", persistPath]);
  const sqlFile = path.join(outDir, "synthetic.sql");
  writeFileSync(sqlFile, syntheticSql);
  run("pnpm", ["exec", "wrangler", "d1", "execute", "serp-checklists-db", "--local", "--persist-to", persistPath, "--file", sqlFile]);
}

// ---------------------------------------------------------------- workload
const personalTemplate = "synthetic-template-50"; // owned by user-1, private
const organizationTemplate = "synthetic-template-40"; // owned by team-seed-growth, private
const publicTemplateSlug = "synthetic-template-5"; // public, user-owned (synthetic ids equal slugs)
const adminRun = "synthetic-run-40"; // owned by user-1
const shareToken = "synthetic-share-50";

function scenarios(): Scenario[] {
  return [
    { name: "public catalog (GET /api/templates)", actor: "anon", path: "/api/templates" },
    { name: "public catalog (repeat)", actor: "anon", path: "/api/templates" },
    { name: "public template by slug", actor: "anon", path: `/api/templates/slug/${publicTemplateSlug}` },
    { name: "public profile templates", actor: "anon", path: "/api/templates/public?userId=synthetic-user-2" },
    { name: "public profile by username", actor: "anon", path: "/api/profiles/by-username?username=synth_2" },
    { name: "shared run", actor: "anon", path: `/api/checklists/shared/${shareToken}` },
    { name: "sitemap index", actor: "anon", path: "/sitemap.xml" },
    { name: "sitemap pages shard", actor: "anon", path: "/sitemaps/pages/1.xml" },
    { name: "sitemap templates shard", actor: "anon", path: "/sitemaps/templates/1.xml" },
    { name: "sitemap profiles shard", actor: "anon", path: "/sitemaps/profiles/1.xml" },
    { name: "sitemap categories shard", actor: "anon", path: "/sitemaps/categories/1.xml" },
    { name: "sitemap index (repeat)", actor: "anon", path: "/sitemap.xml" },
    { name: "sitemap templates shard (repeat)", actor: "anon", path: "/sitemaps/templates/1.xml" },
    { name: "session lookup", actor: "admin", path: "/api/auth/get-session" },
    { name: "billing status", actor: "admin", path: "/api/billing/status" },
    { name: "my Organizations", actor: "admin", path: "/api/teams" },
    { name: "Personal templates (scope=personal)", actor: "admin", path: "/api/templates?scope=personal" },
    { name: "signed-in catalog (scope=public, cached)", actor: "admin", path: "/api/templates?scope=public" },
    { name: "legacy templates list (public OR mine)", actor: "admin", path: "/api/templates" },
    { name: "dashboard templates (Organization)", actor: "admin", path: "/api/templates?teamId=team-seed-growth" },
    { name: "archived templates", actor: "admin", path: "/api/templates/archived" },
    { name: "dashboard runs (Personal)", actor: "admin", path: "/api/checklists" },
    { name: "dashboard runs (Organization)", actor: "admin", path: "/api/checklists?teamId=team-seed-growth" },
    { name: "archived runs", actor: "admin", path: "/api/checklists/archived" },
    { name: "template detail", actor: "admin", path: `/api/templates/${personalTemplate}` },
    { name: "template history", actor: "admin", path: `/api/templates/${personalTemplate}/history` },
    { name: "run detail", actor: "admin", path: `/api/checklists/${adminRun}` },
    { name: "run history", actor: "admin", path: `/api/checklists/${adminRun}/history` },
    { name: "Organization detail", actor: "admin", path: "/api/teams/team-seed-growth" },
    { name: "Organization members", actor: "admin", path: "/api/teams/team-seed-growth/members" },
    { name: "Organization activity", actor: "admin", path: "/api/teams/team-seed-growth/activity?limit=10" },
    { name: "incoming Organization invites", actor: "john", path: "/api/teams/invites/pending" },
    {
      name: "create template (public)", actor: "admin", method: "POST", path: "/api/templates",
      body: { title: "Profiled template", is_public: true, categories: ["SEO"], sections: [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task" }] }] },
    },
    { name: "start run", actor: "admin", method: "POST", path: "/api/checklists", body: { template_id: personalTemplate, title: "Profiled run", sections: [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task one" }, { id: "i2", title: "Task two" }] }] } },
    { name: "update template (reconciles runs)", actor: "admin", method: "PUT", path: `/api/templates/${personalTemplate}`, body: "UPDATE_TEMPLATE" },
    { name: "update Organization template (reconciles runs)", actor: "admin", method: "PUT", path: `/api/templates/${organizationTemplate}`, body: "UPDATE_TEMPLATE" },
    { name: "update run progress", actor: "admin", method: "PUT", path: `/api/checklists/${adminRun}`, body: "UPDATE_RUN" },
    { name: "share run", actor: "admin", method: "POST", path: `/api/checklists/run/${adminRun}/share`, body: {} },
    { name: "member Personal templates", actor: "john", path: "/api/templates?scope=personal" },
    { name: "member Organization templates", actor: "john", path: "/api/templates?teamId=team-seed-growth" },
    { name: "member dashboard runs", actor: "john", path: "/api/checklists" },
    { name: "start run (Free plan, counts active runs)", actor: "john", method: "POST", path: "/api/checklists", body: { template_id: publicTemplateSlug, title: "Profiled Free run", sections: [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task one" }] }] } },
  ];
}

// ---------------------------------------------------------------- server + capture
async function startServer(apiPort: number, origin: string, onRecord: (record: QueryRecord) => void) {
  const child = spawn("pnpm", [
    "exec", "wrangler", "pages", "dev", "./dist", "--local", "--port", String(apiPort), "--persist-to", persistPath,
    "--show-interactive-dev-session=false",
    "-b", "D1_PROFILE=true", "-b", `FRONTEND_URL=${origin}`, "-b", `CORS_ALLOWED_ORIGINS=${origin}`,
    "-b", "BETTER_AUTH_SECRET=d1-profile-secret-at-least-32-characters",
  ], { cwd: repoRoot, shell: isWindows, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  const serverLog = createWriteStream(path.join(outDir, "server.log"));
  const consume = (chunk: Buffer) => {
    serverLog.write(chunk);
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const start = line.indexOf("{\"level\"");
      if (start < 0) continue;
      try {
        const entry = JSON.parse(line.slice(start));
        if (entry.message === "d1_query") onRecord(entry as QueryRecord);
      } catch {
        // Not a JSON log line.
      }
    }
  };
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  const base = `http://localhost:${apiPort}`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return { child, base };
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API did not start");
}

function stop(child: ChildProcess) {
  if (isWindows && child.pid) execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

async function signIn(base: string, origin: string, email: string): Promise<string> {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password: "password123" }),
  });
  if (!response.ok) throw new Error(`Sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

// ---------------------------------------------------------------- report
const shortSql = (sql: string) => sql.replace(/\s+/g, " ").replace(/"/g, "").replace(/^select (.{0,60}?)[^()]*? from /i, "select $1… from ").slice(0, 220);

async function explainPlans(sqls: string[]): Promise<Map<string, string>> {
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: path.join(repoRoot, "wrangler.toml"),
    envFiles: [".d1-profile-no-env"],
    persist: { path: path.resolve(repoRoot, persistPath, "v3") },
  });
  const plans = new Map<string, string>();
  try {
    for (const sql of sqls) {
      if (!/^\s*(select|with)/i.test(sql)) continue;
      try {
        const params = (sql.match(/\?/g) ?? []).map(() => null);
        const result = await platform.env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...params).all<{ detail: string }>();
        plans.set(sql, result.results.map((row) => row.detail).join("; "));
      } catch (error) {
        plans.set(sql, `(plan unavailable: ${error instanceof Error ? error.message : String(error)})`);
      }
    }
    const tableCounts = await platform.env.DB.prepare(
      "SELECT 'templates' AS t, COUNT(*) AS n FROM templates UNION ALL SELECT 'checklist_runs', COUNT(*) FROM checklist_runs UNION ALL SELECT 'users', COUNT(*) FROM users UNION ALL SELECT 'audit_events', COUNT(*) FROM audit_events UNION ALL SELECT 'template_versions', COUNT(*) FROM template_versions UNION ALL SELECT 'team_invites', COUNT(*) FROM team_invites",
    ).all<{ t: string; n: number }>();
    plans.set("__counts__", tableCounts.results.map((row) => `${row.t}: ${row.n.toLocaleString()}`).join(", "));
  } finally {
    await platform.dispose();
  }
  return plans;
}

async function main() {
  if (!existsSync(path.join(repoRoot, "dist/index.html"))) run("pnpm", ["run", "build:dev"]);
  mkdirSync(outDir, { recursive: true });
  if (!reuse) {
    console.log(`Building synthetic D1 at scale ${scale}…`);
    buildDatabase();
  }

  const apiPort = await freePort();
  const origin = "http://localhost:4290";
  let current: QueryRecord[] = [];
  const { child, base } = await startServer(apiPort, origin, (record) => current.push(record));
  const results: { scenario: Scenario; status: number; queries: QueryRecord[] }[] = [];
  try {
    const cookies = { anon: "", admin: await signIn(base, origin, "admin@test.com"), john: await signIn(base, origin, "john@test.com") };
    for (const scenario of scenarios()) {
      await settle();
      let body = scenario.body;
      if (body === "UPDATE_TEMPLATE" || body === "UPDATE_RUN") {
        current = []; // Keep the setup fetch out of the previous scenario's queries.
        const kind = body === "UPDATE_TEMPLATE" ? "templates" : "checklists";
        const currentValue = resourceSchema.parse(await (await fetch(`${base}${scenario.path}`, { headers: { Cookie: cookies.admin, Origin: origin } })).json());
        body = kind === "templates"
          ? { sections: [...(currentValue.sections ?? []), { id: "s-profiled", title: "Added", items: [{ id: "i-profiled", title: "New task" }] }], expected_version: currentValue.version }
          : { progress: 75, expected_revision: currentValue.revision };
        await settle();
      }
      current = [];
      const response = await fetch(`${base}${scenario.path}`, {
        method: scenario.method ?? "GET",
        headers: { Cookie: cookies[scenario.actor], Origin: origin, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await response.arrayBuffer();
      await settle();
      results.push({ scenario, status: response.status, queries: current });
      const read = current.reduce((sum, q) => sum + q.rowsRead, 0);
      console.log(`${String(response.status).padEnd(4)} ${String(read).padStart(8)} rows read  ${scenario.name}`);
    }
  } finally {
    stop(child);
  }

  const byStatement = new Map<string, { calls: number; read: number; written: number; returned: number; maxRead: number; scenarios: Set<string> }>();
  for (const { scenario, queries } of results) {
    for (const query of queries) {
      const entry = byStatement.get(query.sql) ?? { calls: 0, read: 0, written: 0, returned: 0, maxRead: 0, scenarios: new Set<string>() };
      entry.calls += 1;
      entry.read += query.rowsRead;
      entry.written += query.rowsWritten;
      entry.returned += query.rowsReturned;
      entry.maxRead = Math.max(entry.maxRead, query.rowsRead);
      entry.scenarios.add(scenario.name);
      byStatement.set(query.sql, entry);
    }
  }
  const statements = [...byStatement.entries()].sort((a, b) => b[1].read - a[1].read);
  const plans = await explainPlans(statements.map(([sql]) => sql));

  const lines = [
    "# D1 profile",
    "",
    `Scale ${scale}. Table sizes: ${plans.get("__counts__")}.`,
    "",
    "## Per request",
    "",
    "| Request | Status | Statements | Rows read | Rows written | Rows returned |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results
      .map(({ scenario, status, queries }) => ({
        scenario, status, queries,
        read: queries.reduce((sum, q) => sum + q.rowsRead, 0),
        written: queries.reduce((sum, q) => sum + q.rowsWritten, 0),
        returned: queries.reduce((sum, q) => sum + q.rowsReturned, 0),
      }))
      .sort((a, b) => b.read - a.read)
      .map((r) => `| ${r.scenario.name} | ${r.status} | ${r.queries.length} | ${r.read.toLocaleString()} | ${r.written.toLocaleString()} | ${r.returned.toLocaleString()} |`),
    "",
    "## Per statement",
    "",
    "Sorted by rows read. Efficiency = rows returned / rows read (1.0 means no wasted reads).",
    "",
    ...statements.map(([sql, s], index) => [
      `### ${index + 1}. ${s.read.toLocaleString()} rows read in ${s.calls} call(s), max ${s.maxRead.toLocaleString()}`,
      "",
      `- Efficiency: ${s.read ? (s.returned / s.read).toFixed(3) : "n/a"}; rows written: ${s.written.toLocaleString()}`,
      `- Requests: ${[...s.scenarios].join(", ")}`,
      `- Plan: ${plans.get(sql) ?? "(write statement)"}`,
      "",
      "```sql",
      shortSql(sql),
      "```",
      "",
    ].join("\n")),
  ];
  writeFileSync(path.join(outDir, "report.md"), `${lines.join("\n")}\n`);
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(results, null, 2));
  console.log(`\nReport: ${path.join("tmp", "d1-profile", "report.md")}`);
}

await main();
