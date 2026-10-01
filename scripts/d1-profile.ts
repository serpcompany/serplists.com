import type { ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { getPlatformProxy } from "wrangler";
import { createServer } from "node:net";
import { execTool, killProcessTree, spawnTool, type ToolName } from "./lib/run-tool.mjs";
import {
  buildUpdateRunBody,
  buildUpdateTemplateBody,
  computeDatasetKey,
  currentResourceSchema,
  d1QueryRecordIn,
  evaluateScenarioResults,
  formatStatus,
  type QueryRecord,
  readSnapshotMeta,
  resolveDatasetPlan,
  restoreSnapshot,
  saveSnapshot,
  scenarios,
  type Scenario,
  UPDATE_RUN,
  UPDATE_TEMPLATE,
} from "./d1-profile-lib";
import { buildSyntheticSql, datasetCounts } from "./d1-profile-dataset";
import { NO_DEV_VARS_OR_DOTENV_FILES } from "./data/local-d1";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const persistPath = ".wrangler/d1-profile-state";
const snapshotPath = path.join(repoRoot, ".wrangler", "d1-profile-pristine");
const outDir = path.join(repoRoot, "tmp", "d1-profile");
const scaleArg = process.argv.indexOf("--scale");
const scale = scaleArg >= 0 ? Number(process.argv[scaleArg + 1]) : 1;
const reuse = process.argv.includes("--reuse");

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("No free port"))));
    });
  });

function run(tool: ToolName, args: string[]) {
  execTool(tool, args, { cwd: repoRoot, stdio: "inherit", env: { ...process.env, CI: "1" } });
}

const syntheticSql = buildSyntheticSql(datasetCounts(scale));

function buildDatabase() {
  rmSync(path.join(repoRoot, persistPath), { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  run("wrangler", ["d1", "migrations", "apply", "serp-checklists-db", "--local", "--persist-to", persistPath]);
  run("tsx", ["scripts/data/local-d1-data.ts", "seed-test", "--persist-to", persistPath]);
  const sqlFile = path.join(outDir, "synthetic.sql");
  writeFileSync(sqlFile, syntheticSql);
  run("wrangler", ["d1", "execute", "serp-checklists-db", "--local", "--persist-to", persistPath, "--file", sqlFile]);
}

function filesWithTheirText(dir: string, extension: string) {
  return readdirSync(dir).filter((file) => file.endsWith(extension)).sort()
    .map((file) => `${file}\n${readFileSync(path.join(dir, file), "utf8")}`);
}

function hashOfEverythingTheDatasetIsBuiltFrom() {
  const migrations = filesWithTheirText(path.join(repoRoot, "db", "migrations"), ".sql");
  const localSeed = [
    readFileSync(path.join(repoRoot, "db", "seeds", "local.ts"), "utf8"),
    ...filesWithTheirText(path.join(repoRoot, "db", "seeds", "local-test-data"), ".ts"),
  ];
  return computeDatasetKey([...migrations, ...localSeed, syntheticSql]);
}

async function answersHealthCheck(origin: string) {
  try {
    return (await fetch(`${origin}/api/health`)).ok;
  } catch {
    return false;
  }
}

async function startServer(port: number, onRecord: (record: QueryRecord) => void) {
  const origin = `http://localhost:${port}`;
  const child = spawnTool("opennextjs-cloudflare", [
    "preview", "--port", String(port), "--persist-to", persistPath,
    "--show-interactive-dev-session=false",
    "--var", "D1_PROFILE:true", "--var", `FRONTEND_URL:${origin}`, "--var", `CORS_ALLOWED_ORIGINS:${origin}`,
    "--var", "BETTER_AUTH_SECRET:d1-profile-secret-at-least-32-characters",
  ], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "";
  const serverLog = createWriteStream(path.join(outDir, "server.log"));
  const consume = (chunk: Buffer) => {
    serverLog.write(chunk);
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const record = d1QueryRecordIn(line);
      if (record) onRecord(record);
    }
  };
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await answersHealthCheck(origin)) return { child, origin };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("API did not start");
}

function stop(child: ChildProcess) {
  killProcessTree(child, "SIGTERM");
}

async function signIn(origin: string, email: string): Promise<string> {
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email, password: "password123" }),
  });
  if (!response.ok) throw new Error(`Sign-in failed for ${email}: ${response.status} ${await response.text()}`);
  return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

const shortSql = (sql: string) => sql.replace(/\s+/g, " ").replace(/"/g, "").replace(/^select (.{0,60}?)[^()]*? from /i, "select $1… from ").slice(0, 220);

async function explainPlans(sqls: string[]): Promise<Map<string, string>> {
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: path.join(repoRoot, "wrangler.toml"),
    envFiles: NO_DEV_VARS_OR_DOTENV_FILES,
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
    const countedTables = ["templates", "checklist_runs", "users", "audit_events", "template_versions", "team_invites"];
    const tableCounts = await platform.env.DB.prepare(
      `SELECT ${countedTables.map((table) => `(SELECT COUNT(*) FROM ${table}) AS ${table}`).join(", ")}`,
    ).first<Record<string, number>>();
    plans.set("__counts__", countedTables.map((table) => `${table}: ${(tableCounts?.[table] ?? 0).toLocaleString()}`).join(", "));
  } finally {
    await platform.dispose();
  }
  return plans;
}

async function main() {
  run("opennextjs-cloudflare", ["build"]);
  mkdirSync(outDir, { recursive: true });
  const key = hashOfEverythingTheDatasetIsBuiltFrom();
  const statePath = path.join(repoRoot, persistPath);
  const plan = resolveDatasetPlan({ reuse, snapshot: reuse ? readSnapshotMeta(snapshotPath) : null, scale, datasetKey: key });
  console.log(`d1:profile: ${plan.reason}…`);
  if (plan.action === "restore") {
    restoreSnapshot({ snapshotPath, statePath });
  } else {
    buildDatabase();
    saveSnapshot({ statePath, snapshotPath, meta: { scale, datasetKey: key } });
  }

  let recording: QueryRecord[] = [];
  const recordFromNowOn = (): QueryRecord[] => (recording = []);
  const { child, origin } = await startServer(await freePort(), (record) => recording.push(record));
  const results: { scenario: Scenario; status: number; responseBody?: string; queries: QueryRecord[] }[] = [];
  const nonce = Date.now().toString(36);
  try {
    const cookies = { anon: "", admin: await signIn(origin, "admin@test.com"), john: await signIn(origin, "john@test.com") };
    for (const scenario of scenarios()) {
      await settle();
      let body = scenario.body;
      if (body === UPDATE_TEMPLATE || body === UPDATE_RUN) {
        recordFromNowOn();
        const setup = await fetch(`${origin}${scenario.path}`, { headers: { Cookie: cookies.admin, Origin: origin } });
        if (!setup.ok) {
          throw new Error(`Setup GET ${scenario.path} for "${scenario.name}" returned ${setup.status}: ${(await setup.text()).slice(0, 500)}`);
        }
        const currentValue = currentResourceSchema.parse(await setup.json());
        body = body === UPDATE_TEMPLATE ? buildUpdateTemplateBody(currentValue, nonce) : buildUpdateRunBody(currentValue);
        await settle();
      }
      const queries = recordFromNowOn();
      const response = await fetch(`${origin}${scenario.path}`, {
        method: scenario.method ?? "GET",
        headers: { Cookie: cookies[scenario.actor], Origin: origin, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const responseText = await response.text();
      await settle();
      const outcome = { scenario, status: response.status, queries };
      results.push(response.status === scenario.expectedStatus ? outcome : { ...outcome, responseBody: responseText.slice(0, 500) });
      const read = queries.reduce((sum, q) => sum + q.rowsRead, 0);
      console.log(`${formatStatus(outcome).padEnd(4)} ${String(read).padStart(8)} rows read  ${scenario.name}`);
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
  const { failures, exitCode } = evaluateScenarioResults(results);
  const plans = await explainPlans(statements.map(([sql]) => sql));

  const lines = [
    "# D1 profile",
    "",
    `Scale ${scale}. Table sizes: ${plans.get("__counts__")}.`,
    "",
    ...(failures.length > 0
      ? [
        `**INVALID: ${failures.length} request(s) returned an unexpected status, so their rows measure an error path.**`,
        "",
        ...failures.map((failure) => `- ${failure.name}: expected ${failure.expected}, got ${failure.actual}. ${failure.responseBody}`),
        "",
      ]
      : []),
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
      .map((r) => `| ${r.scenario.name} | ${formatStatus(r)} | ${r.queries.length} | ${r.read.toLocaleString()} | ${r.written.toLocaleString()} | ${r.returned.toLocaleString()} |`),
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
  writeFileSync(
    path.join(outDir, "report.json"),
    JSON.stringify(results.map((result) => ({ ...result, valid: result.status === result.scenario.expectedStatus })), null, 2),
  );
  console.log(`\nReport: ${path.join("tmp", "d1-profile", "report.md")}`);
  if (exitCode !== 0) {
    for (const failure of failures) {
      console.error(`INVALID ${failure.name}: expected ${failure.expected}, got ${failure.actual}. ${failure.responseBody}`);
    }
    process.exitCode = exitCode;
  }
}

await main();
