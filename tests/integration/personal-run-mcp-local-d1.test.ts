import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleAgentMcp } from "../../functions/api/handlers/agentMcp";
import {
  createPersonalRunKeySecret,
  insertPersonalRunKeyWithinCap,
} from "../../functions/api/utils/personal-run-key";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(repoRoot, "db/migrations");
const migration25 = "0025_add_personal_run_keys.sql";
const protocolVersion = "2025-06-18";

type TestEnv = {
  DB: D1Database;
  PERSONAL_RUN_MCP_ENABLED?: "true" | "false";
};

type JsonRecord = Record<string, unknown>;

let platform: PlatformProxy<TestEnv>;
let env: TestEnv;
let persistPath = "";
let rawKey = "";
const keyId = "key-user-a";
let runId = "";

function migrationNamesThrough24(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name !== migration25)
    .sort((left, right) => left.localeCompare(right));
}

async function applyMigration(name: string): Promise<void> {
  const statements = readFileSync(path.join(migrationsDir, name), "utf8")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await env.DB.prepare(statement).run();
}

async function rows<T extends JsonRecord>(sql: string, ...bindings: unknown[]): Promise<T[]> {
  const result = await env.DB.prepare(sql).bind(...bindings).all<T>();
  return result.results;
}

function mcpRequest(method: string, params?: unknown, id: number | undefined = 1): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rawKey}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json; charset=utf-8",
      "MCP-Protocol-Version": protocolVersion,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...(id === undefined ? {} : { id }),
      method,
      ...(params === undefined ? {} : { params }),
    }),
  });
}

async function callTool(name: string, args: JsonRecord = {}, id = 1): Promise<Response> {
  return handleAgentMcp(mcpRequest("tools/call", { name, arguments: args }, id), env as never);
}

async function bodyOf(response: Response): Promise<JsonRecord> {
  return response.json() as Promise<JsonRecord>;
}

function toolPayload(body: JsonRecord): JsonRecord {
  return ((body.result as JsonRecord).structuredContent ?? {}) as JsonRecord;
}

function toolError(body: JsonRecord): string | undefined {
  return (toolPayload(body).error as string | undefined);
}

async function seedPreMigrationData(): Promise<void> {
  const userSql = `
    INSERT INTO users (id, email, name, email_verified, created_at)
    VALUES (?, ?, ?, 1, ?)
  `;
  const createdAt = "2026-09-19T00:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(userSql).bind("user-a", "user-a@example.test", "User A", createdAt),
    env.DB.prepare(userSql).bind("user-b", "user-b@example.test", "User B", createdAt),
    env.DB.prepare(`
      INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind("team-a", "Team A", "team-a", "user-a", "user-a", createdAt, createdAt),
    env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, description, items, is_public, category, tags, created_at,
        version, type, owner_type, team_id, created_by_user_id, content_version
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 1, 'checklist', ?, ?, ?, 1)
    `).bind(
      "template-a",
      "user-a",
      "Personal Release SOP",
      "A personal SOP",
      JSON.stringify([{
        id: "section-1",
        title: "Release",
        items: [{
          id: "task-1",
          title: "Verify release",
          notes: "",
          isCompleted: false,
          contents: [{
            type: "subItems",
            subItems: [
              { id: "sub-1", title: "Tests pass", isCompleted: false },
              { id: "sub-2", title: "Preview checked", isCompleted: false },
            ],
          }],
        }],
      }]),
      "release",
      "[]",
      createdAt,
      "user",
      null,
      "user-a",
    ),
    env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES (?, ?, ?, '[]', 0, ?, 1, 'checklist', 'user', NULL, ?, 1)
    `).bind("template-b", "user-b", "Other user's SOP", createdAt, "user-b"),
    env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES (?, ?, ?, '[]', 0, ?, 1, 'checklist', 'team', ?, ?, 1)
    `).bind("template-team", "user-a", "Team SOP", createdAt, "team-a", "user-a"),
    env.DB.prepare(`
      INSERT INTO checklist_runs (
        id, user_id, title, items, status, started_at, created_at, progress,
        team_id, created_by_user_id, started_by_user_id, template_version, revision, retired_items
      ) VALUES (?, ?, ?, '[]', 'in_progress', ?, ?, 0, NULL, ?, ?, 1, 1, '[]')
    `).bind("sentinel-run", "user-b", "Existing run", createdAt, createdAt, "user-b", "user-b"),
  ]);
}

describe.sequential("Personal Run Key MCP against real local D1", () => {
  beforeAll(async () => {
    persistPath = mkdtempSync(path.join(tmpdir(), "serplists-personal-run-mcp-"));
    const pre25SqlPath = path.join(persistPath, "migrations-through-0024.sql");
    writeFileSync(
      pre25SqlPath,
      migrationNamesThrough24()
        .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
        .join("\n"),
    );
    execFileSync("pnpm", [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "serp-checklists-db",
      "--local",
      "--persist-to",
      persistPath,
      "--file",
      pre25SqlPath,
    ], {
      cwd: repoRoot,
      env: { ...process.env, CI: "1" },
      stdio: "pipe",
    });
    platform = await getPlatformProxy<TestEnv>({
      configPath: path.join(repoRoot, "wrangler.toml"),
      envFiles: [".local-d1-env-disabled"],
      persist: { path: path.resolve(repoRoot, persistPath, "v3") },
      remoteBindings: false,
    });
    env = { DB: platform.env.DB, PERSONAL_RUN_MCP_ENABLED: "true" };
    await seedPreMigrationData();
  }, 60_000);

  afterAll(async () => {
    await platform?.dispose();
    if (persistPath) rmSync(persistPath, { recursive: true, force: true });
  });

  it("applies an additive migration and enforces its actual D1 constraints", async () => {
    const beforeObjects = await rows<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    );
    const beforeSentinel = await rows(
      "SELECT id, user_id, title, status, revision FROM checklist_runs WHERE id = 'sentinel-run'",
    );

    await applyMigration(migration25);

    const afterObjects = await rows<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name",
    );
    const addedObjects = afterObjects.map(({ name }) => name)
      .filter((name) => !beforeObjects.some((object) => object.name === name));
    expect(addedObjects).toEqual([
      "idx_personal_run_keys_key_hash_unique",
      "idx_personal_run_keys_user_id",
      "personal_run_keys",
    ]);
    expect(await rows(
      "SELECT id, user_id, title, status, revision FROM checklist_runs WHERE id = 'sentinel-run'",
    )).toEqual(beforeSentinel);
    expect(await rows("PRAGMA foreign_key_check")).toEqual([]);

    const now = "2026-09-19T01:00:00.000Z";
    await expect(env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at)
      VALUES (NULL, 'user-a', 'Null', 'slrk_null', 'null-hash', ?)
    `).bind(now).run()).rejects.toThrow();
    await expect(env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at)
      VALUES ('missing-user', 'missing', 'Missing', 'slrk_missing', 'missing-hash', ?)
    `).bind(now).run()).rejects.toThrow();

    await env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at)
      VALUES ('constraint-key', 'user-b', 'Constraint', 'slrk_constraint', 'constraint-hash', ?)
    `).bind(now).run();
    await expect(env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at)
      VALUES ('constraint-key', 'user-b', 'Duplicate id', 'slrk_other', 'other-hash', ?)
    `).bind(now).run()).rejects.toThrow();
    await expect(env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at)
      VALUES ('duplicate-hash', 'user-b', 'Duplicate hash', 'slrk_duplicate', 'constraint-hash', ?)
    `).bind(now).run()).rejects.toThrow();
  }, 30_000);

  it("stores only a hash and limits a key to its owner's personal workspace", async () => {
    const secret = await createPersonalRunKeySecret();
    rawKey = secret.key;
    await env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at)
      VALUES (?, 'user-a', 'Codex local D1', ?, ?, ?)
    `).bind(keyId, secret.keyPrefix, secret.keyHash, "2026-09-19T02:00:00.000Z").run();

    const stored = await rows<JsonRecord>("SELECT * FROM personal_run_keys WHERE id = ?", keyId);
    expect(JSON.stringify(stored)).not.toContain(rawKey);
    expect(stored[0]).toMatchObject({
      id: keyId,
      user_id: "user-a",
      key_prefix: secret.keyPrefix,
      key_hash: secret.keyHash,
      revoked_at: null,
    });

    const listBody = await bodyOf(await callTool("list_templates"));
    expect((toolPayload(listBody).templates as JsonRecord[]).map(({ id }) => id)).toEqual(["template-a"]);

    const foreignTemplate = await bodyOf(await callTool("start_run", { templateId: "template-b" }));
    expect(toolError(foreignTemplate)).toBe("template_not_found");
    const teamTemplate = await bodyOf(await callTool("start_run", { templateId: "template-team" }));
    expect(toolError(teamTemplate)).toBe("template_not_found");
  });

  it("persists a run, notes, task state, and audit attribution", async () => {
    const startBody = await bodyOf(await callTool("start_run", {
      templateId: "template-a",
      title: "Local D1 MCP Trial",
    }));
    const startedRun = toolPayload(startBody).run as JsonRecord;
    expect(startedRun).toMatchObject({ title: "Local D1 MCP Trial", revision: 1, progress: 0 });
    runId = startedRun.id as string;

    const noteBody = await bodyOf(await callTool("update_run", {
      runId,
      expectedRevision: 1,
      operation: "set_task_notes",
      taskId: "task-1",
      notes: "Verified against the disposable local D1 database.",
    }));
    expect(toolPayload(noteBody).run).toMatchObject({ revision: 2 });

    const completeBody = await bodyOf(await callTool("update_run", {
      runId,
      expectedRevision: 2,
      operation: "set_subtask_completed",
      taskId: "task-1",
      subtaskId: "sub-1",
      completed: true,
    }));
    expect(toolPayload(completeBody).run).toMatchObject({ revision: 3, progress: 33 });

    const [storedRun] = await rows<JsonRecord>("SELECT * FROM checklist_runs WHERE id = ?", runId);
    expect(storedRun).toMatchObject({
      user_id: "user-a",
      team_id: null,
      title: "Local D1 MCP Trial",
      revision: 3,
      progress: 33,
    });
    const sections = JSON.parse(storedRun.items as string);
    expect(sections[0].items[0]).toMatchObject({
      notes: "Verified against the disposable local D1 database.",
      isCompleted: false,
    });
    expect(sections[0].items[0].contents[0].subItems[0].isCompleted).toBe(true);

    const history = await rows<JsonRecord>(
      "SELECT action, actor_user_id, metadata_json FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ? ORDER BY created_at",
      runId,
    );
    expect(history).toHaveLength(3);
    expect(history.every((event) => event.actor_user_id === "user-a")).toBe(true);
    expect(history.every((event) => String(event.metadata_json).includes(`"personalRunKeyId":"${keyId}"`))).toBe(true);
  });

  it("allows exactly one same-revision update and writes exactly one audit event", async () => {
    const beforeAudit = await rows<{ count: number }>(
      "SELECT count(*) AS count FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ?",
      runId,
    );

    const updates = await Promise.all([
      callTool("update_run", {
        runId,
        expectedRevision: 3,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Concurrent writer A",
      }, 41),
      callTool("update_run", {
        runId,
        expectedRevision: 3,
        operation: "set_task_notes",
        taskId: "task-1",
        notes: "Concurrent writer B",
      }, 42),
    ]);
    const bodies = await Promise.all(updates.map(bodyOf));
    expect(bodies.filter((body) => toolError(body) === undefined)).toHaveLength(1);
    expect(bodies.filter((body) => toolError(body) === "edit_conflict")).toHaveLength(1);

    const [storedRun] = await rows<JsonRecord>("SELECT revision FROM checklist_runs WHERE id = ?", runId);
    expect(storedRun.revision).toBe(4);
    const afterAudit = await rows<{ count: number }>(
      "SELECT count(*) AS count FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ?",
      runId,
    );
    expect(afterAudit[0].count).toBe(beforeAudit[0].count + 1);
  });

  it("rolls a run mutation back when its audit insert fails", async () => {
    const [beforeRun] = await rows<JsonRecord>(
      "SELECT items, progress, revision, updated_at FROM checklist_runs WHERE id = ?",
      runId,
    );
    const [beforeAudit] = await rows<{ count: number }>(
      "SELECT count(*) AS count FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ?",
      runId,
    );
    await env.DB.prepare(`
      CREATE TRIGGER reject_test_mcp_audit
      BEFORE INSERT ON audit_events
      WHEN NEW.resource_id = '${runId}'
      BEGIN
        SELECT RAISE(ABORT, 'forced_test_audit_failure');
      END
    `).run();

    try {
      const response = await callTool("update_run", {
        runId,
        expectedRevision: 4,
        operation: "set_run_status",
        status: "completed",
      });
      const body = await bodyOf(response);
      expect(response.status).toBe(200);
      expect((body.error as JsonRecord | undefined)?.code).toBe(-32603);
    } finally {
      await env.DB.prepare("DROP TRIGGER reject_test_mcp_audit").run();
    }

    expect(await rows(
      "SELECT items, progress, revision, updated_at FROM checklist_runs WHERE id = ?",
      runId,
    )).toEqual([beforeRun]);
    const [afterAudit] = await rows<{ count: number }>(
      "SELECT count(*) AS count FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ?",
      runId,
    );
    expect(afterAudit.count).toBe(beforeAudit.count);
  });

  it("creates and edits a private personal template and syncs its in-progress runs", async () => {
    const sections = [{
      title: "Boot",
      items: [{
        title: "Install",
        contents: [{ type: "subItems", subItems: [{ title: "pnpm install" }] }],
      }],
    }];

    const limited = await bodyOf(await callTool("create_template", { title: "Agent Harness Setup", sections }));
    expect(toolError(limited)).toBe("limit_reached");

    await env.DB.prepare(`
      INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-a', 'pro', ?)
    `).bind("2026-09-19T02:30:00.000Z").run();

    const createBody = await bodyOf(await callTool("create_template", {
      title: "Agent Harness Setup",
      description: "Per-project harness checklist",
      sections,
      tags: ["harness"],
    }));
    const created = toolPayload(createBody).template as JsonRecord;
    expect(created).toMatchObject({ title: "Agent Harness Setup", version: 1, tags: ["harness"] });
    const templateId = created.id as string;
    const [storedTemplate] = await rows<JsonRecord>(
      "SELECT user_id, owner_type, team_id, is_public FROM templates WHERE id = ?",
      templateId,
    );
    expect(storedTemplate).toEqual({ user_id: "user-a", owner_type: "user", team_id: null, is_public: 0 });

    const createdSection = (created.sections as JsonRecord[])[0];
    const createdTask = (createdSection.items as JsonRecord[])[0];
    expect(typeof createdSection.id).toBe("string");
    expect(typeof createdTask.id).toBe("string");

    const startBody = await bodyOf(await callTool("start_run", { templateId }));
    const templateRunId = (toolPayload(startBody).run as JsonRecord).id as string;
    await callTool("update_run", {
      runId: templateRunId,
      expectedRevision: 1,
      operation: "set_task_completed",
      taskId: createdTask.id as string,
      completed: true,
    });

    const updateBody = await bodyOf(await callTool("update_template", {
      templateId,
      expectedVersion: 1,
      sections: [{ ...createdSection, items: [createdTask, { title: "Verify" }] }],
    }));
    const updated = toolPayload(updateBody).template as JsonRecord;
    expect(updated.version).toBe(2);
    expect(((updated.sections as JsonRecord[])[0].items as JsonRecord[]).map(({ title }) => title))
      .toEqual(["Install", "Verify"]);

    const runBody = await bodyOf(await callTool("get_run", { runId: templateRunId }));
    const runTasks = ((toolPayload(runBody).run as JsonRecord).sections as JsonRecord[])[0].items as JsonRecord[];
    expect(runTasks.map(({ title, isCompleted }) => ({ title, isCompleted: isCompleted === true }))).toEqual([
      { title: "Install", isCompleted: true },
      { title: "Verify", isCompleted: false },
    ]);

    const stale = await bodyOf(await callTool("update_template", { templateId, expectedVersion: 1, title: "Stale" }));
    expect(toolError(stale)).toBe("edit_conflict");

    const history = await rows<JsonRecord>(
      "SELECT action, actor_user_id, metadata_json FROM audit_events WHERE resource_type = 'template' AND resource_id = ? ORDER BY created_at",
      templateId,
    );
    expect(history.map(({ action }) => action)).toEqual(["template.created", "template.updated"]);
    expect(history.every((event) => event.actor_user_id === "user-a")).toBe(true);
    expect(history.every((event) => String(event.metadata_json).includes(`"personalRunKeyId":"${keyId}"`))).toBe(true);
  });

  it("keeps template writes inside the key owner's private personal templates", async () => {
    const sections = [{ title: "Section", items: [{ title: "Task" }] }];
    for (const templateId of ["template-b", "template-team"]) {
      const read = await bodyOf(await callTool("get_template", { templateId }));
      expect(toolError(read)).toBe("template_not_found");
      const write = await bodyOf(await callTool("update_template", { templateId, expectedVersion: 1, title: "Taken" }));
      expect(toolError(write)).toBe("template_not_found");
    }

    for (const extra of [{ is_public: true }, { teamId: "team-a" }, { visibility: "public" }]) {
      const body = await bodyOf(await callTool("create_template", { title: "Escalation", sections, ...extra }));
      expect(((body.error as JsonRecord).data as JsonRecord).code).toBe("invalid_arguments");
    }

    expect(await rows("SELECT title FROM templates WHERE id IN ('template-b', 'template-team') ORDER BY id")).toEqual([
      { title: "Other user's SOP" },
      { title: "Team SOP" },
    ]);
    expect(await rows("SELECT id FROM templates WHERE title = 'Escalation'")).toEqual([]);
  });

  it("revokes immediately and cascades keys only with their owning user", async () => {
    await env.DB.prepare("UPDATE personal_run_keys SET revoked_at = ? WHERE id = ?")
      .bind("2026-09-19T03:00:00.000Z", keyId)
      .run();
    const denied = await handleAgentMcp(mcpRequest("tools/list"), env as never);
    expect(denied.status).toBe(401);

    await env.DB.prepare(`
      INSERT INTO users (id, email, name, email_verified, created_at)
      VALUES ('cascade-user', 'cascade@example.test', 'Cascade User', 1, '2026-09-19T03:00:00.000Z')
    `).run();
    await env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at)
      VALUES ('cascade-key', 'cascade-user', 'Cascade key', 'slrk_cascade', 'cascade-hash', '2026-09-19T03:00:00.000Z')
    `).run();
    await env.DB.prepare("DELETE FROM users WHERE id = 'cascade-user'").run();
    expect(await rows("SELECT id FROM personal_run_keys WHERE user_id = 'cascade-user'")).toEqual([]);
    expect(await rows("SELECT id FROM personal_run_keys WHERE user_id = 'user-a'")).toEqual([{ id: keyId }]);
    expect(await rows("SELECT id FROM personal_run_keys WHERE id = 'constraint-key'")).toEqual([{ id: "constraint-key" }]);
    expect(await rows("SELECT id FROM users WHERE id = 'user-b'")).toEqual([{ id: "user-b" }]);
    expect(await rows("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("caps active keys per user atomically and ignores revoked keys", async () => {
    await env.DB.prepare(`
      INSERT INTO users (id, email, name, email_verified, created_at)
      VALUES ('cap-user', 'cap@example.test', 'Cap User', 1, '2026-09-19T04:00:00.000Z')
    `).run();
    const record = (index: number) => ({
      id: `cap-key-${index}`,
      user_id: "cap-user",
      name: `Cap key ${index}`,
      key_prefix: "slrk_cap",
      key_hash: `cap-hash-${index}`,
      created_at: "2026-09-19T04:00:00.000Z",
    });

    // Twelve parallel creates: exactly ten may succeed.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) => insertPersonalRunKeyWithinCap(env as never, record(index))),
    );
    expect(results.filter(Boolean)).toHaveLength(10);
    expect(await rows("SELECT id FROM personal_run_keys WHERE user_id = 'cap-user' AND revoked_at IS NULL"))
      .toHaveLength(10);

    await env.DB.prepare("UPDATE personal_run_keys SET revoked_at = ? WHERE id = ?")
      .bind("2026-09-19T05:00:00.000Z", "cap-key-0")
      .run();
    expect(await insertPersonalRunKeyWithinCap(env as never, record(20))).toBe(true);
    expect(await insertPersonalRunKeyWithinCap(env as never, record(21))).toBe(false);
  });
});
