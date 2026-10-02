import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlatformProxy } from "wrangler";
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { handleAgentMcp } from "../../functions/api/handlers/agentMcp";
import { MAX_RESULT_BYTES } from "../../functions/api/handlers/agentMcpPages";
import { MAX_TASK_NOTES_LENGTH } from "../../functions/api/handlers/agentMcpTools";
import { RUN_KEY_REQUESTS_PER_MINUTE } from "../../functions/api/utils/mcp-limits";
import {
  createPersonalRunKeySecret,
  insertPersonalRunKeyWithinCap,
  MAX_ACTIVE_PERSONAL_RUN_KEYS,
} from "../../functions/api/utils/personal-run-key";
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES, TEMPLATE_CONTENT_MAX_BYTES } from "../../src/lib/schemas/contentLimits";
import { readRunInFull } from "../support/runPages";
import { readTemplateInFull } from "../support/templatePages";
import { platformProxyOnLocalD1, runToolInRepo } from "./local-d1-handler-env";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(repoRoot, "db/migrations");
const migration25 = "0025_add_personal_run_keys.sql";
const migration27 = "0027_add_personal_run_key_permissions.sql";
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
    .filter((name) => name.endsWith(".sql") && name !== migration25 && name !== migration27)
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

function mcpRequest(method: string, params?: unknown, id: number | undefined = 1, path = "/api/mcp", key = rawKey): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
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

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const PROSE = "Confirm the owner, the rollback plan, and the customer notice — then record it. Überprüfen. 🚀 ";
const PROSE_CHARACTERS = Array.from(PROSE);
const proseOfWholeCharacters = (characterCount: number) =>
  Array.from({ length: characterCount }, (_, index) => PROSE_CHARACTERS[index % PROSE_CHARACTERS.length]).join("");
const notesWithinUtf16Units = (unitCount: number) => {
  let units = 0;
  return Array.from(proseOfWholeCharacters(unitCount)).filter((character) => (units += character.length) <= unitCount).join("");
};
const textTask = (id: string, textLength: number) => ({
  id,
  title: `Task ${id}`,
  description: `Why ${id} matters`,
  contents: [{ id: `${id}-text`, type: "text", value: proseOfWholeCharacters(textLength) }],
});

function sectionsAbout1KbUnderTheTemplateLimit(): JsonRecord[] {
  const longTaskReadInParts = textTask("guide-long", 90_000);
  const guide = { id: "guide", title: "Guide", items: [textTask("guide-intro", 400), longTaskReadInParts] };
  const checksOf130TasksReadInPages = { id: "checks", title: "Checks", items: Array.from({ length: 130 }, (_, index) => textTask(`check-${index}`, 520)) };
  const sections: JsonRecord[] = [guide, checksOf130TasksReadInPages];
  for (let index = 0; sections.length < 24; index += 1) {
    const areaReadWhole = {
      id: `area-${index}`,
      title: `Area ${index}`,
      items: Array.from({ length: 16 }, (_, task) => textTask(`area-${index}-${task}`, 1_350)),
    };
    sections.push(areaReadWhole);
  }
  const longTaskText = longTaskReadInParts.contents[0];
  const bytesPerCharacter = new TextEncoder().encode(PROSE).byteLength / PROSE_CHARACTERS.length;
  const roomToGrowUntilAbout1KbUnderTheLimit = TEMPLATE_CONTENT_MAX_BYTES - 1_000 - contentSaveBytes(sections);
  longTaskText.value = proseOfWholeCharacters(
    Array.from(longTaskText.value).length + Math.floor(roomToGrowUntilAbout1KbUnderTheLimit / bytesPerCharacter),
  );
  return sections;
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
    runToolInRepo("wrangler", ["d1", "execute", "serp-checklists-db", "--local", "--persist-to", persistPath, "--file", pre25SqlPath]);
    platform = await platformProxyOnLocalD1<TestEnv>(persistPath);
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
    await applyMigration(migration27);

    const stored = await rows<JsonRecord>("SELECT * FROM personal_run_keys WHERE id = ?", keyId);
    expect(JSON.stringify(stored)).not.toContain(rawKey);
    expect(stored[0]).toMatchObject({
      id: keyId,
      user_id: "user-a",
      key_prefix: secret.keyPrefix,
      key_hash: secret.keyHash,
      revoked_at: null,
      permissions: '["templates:read","runs:read","runs:write"]',
    });

    const toolsBody = await bodyOf(await handleAgentMcp(mcpRequest("tools/list"), env as never));
    expect(((toolsBody.result as JsonRecord).tools as JsonRecord[]).map(({ name }) => name)).toEqual([
      "list_templates",
      "get_template",
      "start_run",
      "list_runs",
      "get_run",
      "update_run",
    ]);

    const listBody = await bodyOf(await callTool("list_templates"));
    expect((toolPayload(listBody).templates as JsonRecord[]).map(({ id }) => id)).toEqual(["template-a"]);

    const foreignTemplate = await bodyOf(await callTool("start_run", { templateId: "template-b" }));
    expect(toolError(foreignTemplate)).toBe("template_not_found");
    const teamTemplate = await bodyOf(await callTool("start_run", { templateId: "template-team" }));
    expect(toolError(teamTemplate)).toBe("template_not_found");
  });

  it("persists a run, notes, task state, and audit attribution, in audit rows that describe each change without copying the run's content", async () => {
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

    const itemsCopiesAndSizeOfEachAuditRow = await rows<JsonRecord>(`
      SELECT
        coalesce(json_extract(before_json, '$.items'), json_extract(after_json, '$.items'),
          json_extract(diff_json, '$.items'), json_extract(after_json, '$.retired_items')) AS stored_items,
        length(coalesce(before_json, '')) + length(coalesce(after_json, '')) + length(coalesce(diff_json, '')) AS bytes
      FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ?
    `, runId);
    expect(itemsCopiesAndSizeOfEachAuditRow.map(({ stored_items }) => stored_items)).toEqual([null, null, null]);
    expect(Math.max(...itemsCopiesAndSizeOfEachAuditRow.map(({ bytes }) => Number(bytes)))).toBeLessThan(2_048);
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
        operation: "set_task_completed",
        taskId: "task-1",
        completed: true,
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

  it("creates no run when start_run rejects a template stored before the 768KB limit with more than a run's 896KB", async () => {
    const about930KbOfDescriptionsThatANewRunCopies = Array.from({ length: 93 }, (_, index) => ({
      id: `large-task-${index}`,
      title: `Large task ${index}`,
      isCompleted: false,
      description: "x".repeat(10_000),
    }));
    const items = [{ id: "section-large", title: "Large", items: about930KbOfDescriptionsThatANewRunCopies }];
    await env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES ('template-large', 'user-a', 'Large SOP', ?, 0, ?, 1, 'checklist', 'user', NULL, 'user-a', 1)
    `).bind(JSON.stringify(items), "2026-09-19T02:30:00.000Z").run();
    const countRuns = async () => (await rows<{ count: number }>(
      "SELECT count(*) AS count FROM checklist_runs WHERE user_id = 'user-a'",
    ))[0].count;
    const before = await countRuns();

    const errors: Array<string | undefined> = [];
    for (const id of [51, 52]) {
      errors.push(toolError(await bodyOf(await callTool("start_run", { templateId: "template-large" }, id))));
    }

    expect(await countRuns()).toBe(before);
    expect(errors).toEqual(["content_too_large", "content_too_large"]);
  });

  it("holds a Free owner to the active run limit under concurrent start_run calls", async () => {
    const freeLimit = 3;
    const activeRuns = async () => (await rows<{ count: number }>(`
      SELECT count(*) AS count FROM checklist_runs
      WHERE user_id = 'user-a' AND team_id IS NULL AND status = 'in_progress' AND deleted_at IS NULL
    `))[0].count;
    const createdAudits = async () => (await rows<{ count: number }>(
      "SELECT count(*) AS count FROM audit_events WHERE action = 'checklist_run.created' AND actor_user_id = 'user-a'",
    ))[0].count;
    const activeBefore = await activeRuns();
    const auditsBefore = await createdAudits();
    expect(activeBefore).toBeLessThan(freeLimit);

    const bodies = await Promise.all([61, 62, 63, 64, 65].map(async (id) =>
      bodyOf(await callTool("start_run", { templateId: "template-a" }, id))));

    const started = bodies.filter((body) => toolError(body) === undefined);
    expect(started).toHaveLength(freeLimit - activeBefore);
    expect(bodies.filter((body) => toolError(body) === "limit_reached")).toHaveLength(bodies.length - started.length);
    expect(await activeRuns()).toBe(freeLimit);
    expect(await createdAudits()).toBe(auditsBefore + started.length);
  });

  it("lists a never-edited template ahead of older edits, and the rest a page at a time", async () => {
    const insertTemplate = (id: string, createdAt: string, updatedAt: string | null) => env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, updated_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES (?, 'user-a', ?, '[]', 0, ?, ?, 1, 'checklist', 'user', NULL, 'user-a', 1)
    `).bind(id, `SOP ${id}`, createdAt, updatedAt);
    await env.DB.batch(Array.from({ length: 101 }, (_, index) => {
      const suffix = String(index).padStart(3, "0");
      return insertTemplate(`edited-${suffix}`, "2024-01-01T00:00:00.000Z", `2025-01-01T00:00:00.${suffix}Z`);
    }));
    const importedInOneRequestAndNeverEdited = [
      insertTemplate("imported-a", "2026-09-20T00:00:00.000Z", null),
      insertTemplate("imported-b", "2026-09-20T00:00:00.000Z", null),
    ];
    await env.DB.batch(importedInOneRequestAndNeverEdited);

    const payload = toolPayload(await bodyOf(await callTool("list_templates", {}, 71)));
    const ids = (payload.templates as JsonRecord[]).map(({ id }) => id);

    expect(ids.slice(0, 2)).toEqual(["imported-b", "imported-a"]);
    expect(ids).toContain("template-a");
    expect(ids).toHaveLength(100);
    expect(byteLength(payload)).toBeLessThanOrEqual(MAX_RESULT_BYTES);

    const nextPageWithTheOldestEdits = toolPayload(await bodyOf(await callTool("list_templates", { cursor: payload.nextCursor }, 72)));
    expect((nextPageWithTheOldestEdits.templates as JsonRecord[]).map(({ id }) => id))
      .toEqual(["edited-004", "edited-003", "edited-002", "edited-001", "edited-000"]);
    expect(nextPageWithTheOldestEdits).not.toHaveProperty("nextCursor");
  });

  it("creates and edits a private personal template and syncs its in-progress runs, whose Changelog names the Run Key", async () => {
    const sections = [{
      title: "Boot",
      items: [{
        title: "Install",
        contents: [{ type: "subItems", subItems: [{ title: "pnpm install" }] }],
      }],
    }];

    const denied = await bodyOf(await callTool("create_template", { title: "Agent Harness Setup", sections }));
    expect(toolError(denied)).toBe("permission_denied");
    expect(await rows("SELECT id FROM templates WHERE title = 'Agent Harness Setup'")).toEqual([]);

    await env.DB.prepare("UPDATE personal_run_keys SET permissions = ? WHERE id = ?")
      .bind('["templates:read","templates:write","runs:read","runs:write"]', keyId)
      .run();

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

    const reconciledEventsInTheRunsChangelog = await rows<JsonRecord>(
      "SELECT metadata_json FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ? AND action = 'checklist_run.reconciled'",
      templateRunId,
    );
    expect(reconciledEventsInTheRunsChangelog).toHaveLength(1);
    expect(String(reconciledEventsInTheRunsChangelog[0].metadata_json)).toContain(`"personalRunKeyId":"${keyId}"`);
  });

  it("keeps template writes inside the key owner's private personal templates", async () => {
    const sections = [{ title: "Section", items: [{ title: "Task" }] }];
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at)
        VALUES ('member-a', 'team-a', 'user-a', 'owner', 'active', ?, ?)
      `).bind("2026-09-19T02:40:00.000Z", "2026-09-19T02:40:00.000Z"),
      env.DB.prepare(`
        INSERT INTO templates (
          id, user_id, title, items, is_public, created_at, version, type, owner_type,
          team_id, created_by_user_id, content_version
        ) VALUES ('template-public', 'user-a', 'Published SOP', ?, 1, ?, 1, 'checklist', 'user', NULL, 'user-a', 1)
      `).bind(JSON.stringify(sections), "2026-09-19T02:40:00.000Z"),
    ]);

    const publicRead = await bodyOf(await callTool("get_template", { templateId: "template-public" }));
    expect((toolPayload(publicRead).template as JsonRecord).title).toBe("Published SOP");
    const publicWrite = await bodyOf(await callTool("update_template", {
      templateId: "template-public",
      expectedVersion: 1,
      title: "Defaced public SOP",
    }));
    expect(toolError(publicWrite)).toBe("template_is_public");

    const viaQuery = await bodyOf(await handleAgentMcp(mcpRequest("tools/call", {
      name: "create_template",
      arguments: { title: "Created with teamId query", sections },
    }, 1, "/api/mcp?teamId=team-a"), env as never));
    const viaQueryId = (toolPayload(viaQuery).template as JsonRecord).id;
    expect(await rows("SELECT owner_type, team_id, is_public FROM templates WHERE id = ?", viaQueryId)).toEqual([
      { owner_type: "user", team_id: null, is_public: 0 },
    ]);

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

    expect(await rows(
      "SELECT title FROM templates WHERE id IN ('template-b', 'template-public', 'template-team') ORDER BY id",
    )).toEqual([
      { title: "Other user's SOP" },
      { title: "Published SOP" },
      { title: "Team SOP" },
    ]);
    expect(await rows("SELECT id FROM templates WHERE title = 'Escalation'")).toEqual([]);
  });

  it("reports a committed oversized create as success without its sections", async () => {
    const body = await bodyOf(await callTool("create_template", {
      title: "Oversized SOP",
      sections: [{ title: "Long", items: [{ title: "Read", contents: [{ type: "text", value: "x".repeat(300_000) }] }] }],
    }));
    expect(toolError(body)).toBeUndefined();
    expect(toolPayload(body).sectionsOmitted).toBe(true);
    expect(toolPayload(body).template).not.toHaveProperty("sections");
    expect(await rows("SELECT id FROM templates WHERE title = 'Oversized SOP'")).toHaveLength(1);
  });

  it("reads a template near the 768KB limit back in full and edits it a part at a time", async () => {
    const sections = sectionsAbout1KbUnderTheTemplateLimit();
    expect(contentSaveBytes(sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    expect(contentSaveBytes(sections)).toBeGreaterThan(TEMPLATE_CONTENT_MAX_BYTES - 16 * 1024);

    const created = toolPayload(await bodyOf(await callTool("create_template", {
      title: "Operations Handbook",
      description: "Everything the on-call team checks",
      sections,
    })));
    expect(created.sectionsOmitted).toBe(true);
    const templateId = (created.template as JsonRecord).id as string;

    const resultBytes: number[] = [];
    const readTool = async (args: JsonRecord) => {
      const body = await bodyOf(await callTool("get_template", args));
      const result = body.result as JsonRecord;
      expect(result.isError).toBeUndefined();
      resultBytes.push(new TextEncoder().encode(JSON.stringify(result.structuredContent)).byteLength);
      return result.structuredContent as JsonRecord;
    };

    const { template, results } = await readTemplateInFull(readTool, templateId);
    expect(template).toMatchObject({ id: templateId, title: "Operations Handbook", version: 1 });
    expect(template.sections).toEqual(sections);
    expect(Math.max(...resultBytes)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(results.length).toBeLessThan(RUN_KEY_REQUESTS_PER_MINUTE / 3);
    expect(results.some((result) => (result.part as JsonRecord | undefined)?.of === "task")).toBe(true);
    expect(results.some((result) => typeof (result.section as JsonRecord | undefined)?.firstTask === "number")).toBe(true);
    const guideCursor = (await readTool({ templateId, sectionId: "guide" })).nextCursor as string;
    expect(typeof guideCursor).toBe("string");

    const update = async (args: JsonRecord) => toolPayload(await bodyOf(await callTool("update_template", { templateId, ...args })));

    const replaced = await update({ expectedVersion: 1, operation: "replace_task", taskId: "check-7", task: { title: "Check the pager" } });
    expect(replaced).toMatchObject({ sectionsOmitted: true, sectionId: "checks", taskId: "check-7", task: { title: "Check the pager" } });
    expect(replaced.template).toMatchObject({ version: 2 });

    const inserted = await update({
      expectedVersion: 2,
      operation: "insert_task",
      beforeTaskId: "guide-long",
      task: { title: "Read the summary first" },
    });
    const insertedId = inserted.taskId as string;
    expect(insertedId).toMatch(/^item_/);
    expect(inserted.task).toEqual({ id: insertedId, title: "Read the summary first" });

    const moved = await update({ expectedVersion: 3, operation: "move_section", sectionId: "guide" });
    expect(moved.template).toMatchObject({ version: 4 });
    const removed = await update({ expectedVersion: 4, operation: "remove_task", taskId: "area-0-3" });
    expect(removed.template).toMatchObject({ version: 5 });

    const stale = await bodyOf(await callTool("update_template", {
      templateId,
      expectedVersion: 4,
      operation: "remove_task",
      taskId: "area-0-4",
    }));
    expect(toolError(stale)).toBe("edit_conflict");
    const staleRead = await bodyOf(await callTool("get_template", { templateId, cursor: guideCursor }));
    expect(toolError(staleRead)).toBe("edit_conflict");

    const templateWithOnlyThoseFourChanges = structuredClone(sections);
    const checks = templateWithOnlyThoseFourChanges[1].items as JsonRecord[];
    checks[7] = { ...checks[7], title: "Check the pager" };
    (templateWithOnlyThoseFourChanges[0].items as JsonRecord[]).splice(1, 0, { id: insertedId, title: "Read the summary first" });
    templateWithOnlyThoseFourChanges.push(templateWithOnlyThoseFourChanges.shift() as JsonRecord);
    (templateWithOnlyThoseFourChanges[1].items as JsonRecord[]).splice(3, 1);
    const [stored] = await rows<JsonRecord>("SELECT items, version FROM templates WHERE id = ?", templateId);
    expect(stored.version).toBe(5);
    expect(JSON.parse(stored.items as string)).toEqual(templateWithOnlyThoseFourChanges);

    const outline = await readTool({ templateId });
    expect((outline.outline as JsonRecord[]).map(({ id }) => id).at(-1)).toBe("guide");
    expect(await readTool({ templateId, taskId: insertedId })).toMatchObject({ sectionId: "guide", task: { id: insertedId } });

    const history = await rows<JsonRecord>(
      "SELECT metadata_json FROM audit_events WHERE resource_type = 'template' AND resource_id = ? AND action = 'template.updated' ORDER BY created_at",
      templateId,
    );
    expect(history.map(({ metadata_json }) => (JSON.parse(String(metadata_json)) as JsonRecord).operation))
      .toEqual(["replace_task", "insert_task", "move_section", "remove_task"]);
  }, 60_000);

  it("reads a run near the 896KB limit back in full, a bounded result at a time, and updates it", async () => {
    const runKeyOfItsOwnForTheLongRead = await createPersonalRunKeySecret();
    await env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at, permissions)
      VALUES ('key-user-a-runs', 'user-a', 'Run reader', ?, ?, ?, ?)
    `).bind(
      runKeyOfItsOwnForTheLongRead.keyPrefix,
      runKeyOfItsOwnForTheLongRead.keyHash,
      "2026-09-19T02:50:00.000Z",
      '["templates:read","templates:write","runs:read","runs:write"]',
    ).run();
    const removeItForTheKeyCountChecksThatExpectOnlyTheFirstKey = async () => {
      await env.DB.prepare("DELETE FROM personal_run_keys WHERE id = 'key-user-a-runs'").run();
    };
    onTestFinished(removeItForTheKeyCountChecksThatExpectOnlyTheFirstKey);
    let calls = 0;
    const call = async (name: string, args: JsonRecord): Promise<JsonRecord> => {
      calls += 1;
      const body = await bodyOf(await handleAgentMcp(
        mcpRequest("tools/call", { name, arguments: args }, calls, "/api/mcp", runKeyOfItsOwnForTheLongRead.key),
        env as never,
      ));
      expect(body.error, `${name}: ${JSON.stringify(body.error)}`).toBeUndefined();
      const payload = toolPayload(body);
      expect(byteLength(payload), name).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      return payload;
    };
    const tool = async (name: string, args: JsonRecord): Promise<JsonRecord> => {
      const payload = await call(name, args);
      expect(payload.error, `${name}: ${String(payload.message)}`).toBeUndefined();
      return payload;
    };

    const created = await tool("create_template", { title: "Incident Runbook", sections: sectionsAbout1KbUnderTheTemplateLimit() });
    const templateId = (created.template as JsonRecord).id as string;
    const started = await tool("start_run", { templateId, title: "Incident drill" });
    expect(started).toMatchObject({ run: { title: "Incident drill", revision: 1 }, sectionsOmitted: true });
    const runId = (started.run as JsonRecord).id as string;
    let revision = 1;
    const update = async (args: JsonRecord) => {
      const result = await tool("update_run", { runId, expectedRevision: revision, ...args });
      revision = (result.run as JsonRecord).revision as number;
      return result;
    };
    const storedRun = async () => (await rows<JsonRecord>(
      "SELECT items, retired_items, revision FROM checklist_runs WHERE id = ?",
      runId,
    ))[0];

    await update({ operation: "set_task_notes", taskId: "area-0-0", notes: notesWithinUtf16Units(MAX_TASK_NOTES_LENGTH) });
    await update({ operation: "set_task_notes", taskId: "check-5", notes: "Pager rotated before the drill." });
    const removalsOfTheNotedSectionAndTaskTheRunKeepsAsRetiredWork = [
      { operation: "remove_section", sectionId: "area-0" },
      { operation: "remove_task", taskId: "check-5" },
    ];
    let version = 1;
    for (const operation of removalsOfTheNotedSectionAndTaskTheRunKeepsAsRetiredWork) {
      version = ((await tool("update_template", { templateId, expectedVersion: version, ...operation })).template as JsonRecord).version as number;
    }
    revision = Number((await storedRun()).revision);
    expect(revision).toBe(5);

    for (let area = 1; ; area += 1) {
      const roomLeftAbove1KbUnderTheRunLimit = RUN_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(JSON.parse(String((await storedRun()).items)));
      if (roomLeftAbove1KbUnderTheRunLimit < 1_000) break;
      const notes = notesWithinUtf16Units(Math.min(MAX_TASK_NOTES_LENGTH, Math.floor(roomLeftAbove1KbUnderTheRunLimit / 1.1)));
      await update({ operation: "set_task_notes", taskId: `area-${area}-0`, notes });
    }
    const stored = await storedRun();
    const storedSections = JSON.parse(String(stored.items)) as JsonRecord[];
    const storedRetired = JSON.parse(String(stored.retired_items)) as JsonRecord[];
    expect(contentSaveBytes(storedSections)).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
    expect(contentSaveBytes(storedSections)).toBeGreaterThan(RUN_CONTENT_MAX_BYTES - 4 * 1024);
    expect(storedRetired.map(({ kind }) => kind)).toEqual(["section", "item"]);

    const before = calls;
    const { run, results } = await readRunInFull((args) => tool("get_run", args), runId);
    expect(run).toMatchObject({ id: runId, title: "Incident drill", revision, templateVersion: 3 });
    expect(run.sections).toEqual(storedSections);
    expect(run.retiredItems).toEqual(storedRetired);
    const parts = new Set(results.flatMap((result) => (result.part ? [(result.part as JsonRecord).of] : [])));
    expect(parts).toEqual(new Set(["task", "retiredItem"]));
    expect(results.some((result) => typeof (result.section as JsonRecord | undefined)?.firstTask === "number")).toBe(true);
    expect(calls - before).toBe(results.length);
    expect(results.length).toBeLessThan(80);
    const staleCursor = results.find((result) => typeof result.nextCursor === "string")?.nextCursor;
    expect(typeof staleCursor).toBe("string");

    const ticked = await update({ operation: "set_task_completed", taskId: "check-100", completed: true });
    expect(ticked).toMatchObject({ sectionId: "checks", taskId: "check-100", task: { id: "check-100", isCompleted: true } });
    const noted = await update({ operation: "set_task_notes", taskId: "guide-long", notes: "Read the summary first." });
    expect(noted).toEqual({ run: expect.objectContaining({ id: runId, revision }), sectionId: "guide", taskId: "guide-long", taskOmitted: true });
    expect(await call("get_run", { runId, cursor: staleCursor })).toMatchObject({
      error: "edit_conflict",
      details: { currentRevision: revision },
    });

    const after = JSON.parse(String((await storedRun()).items)) as JsonRecord[];
    const task = (sectionIndex: number, taskId: string) => ((after[sectionIndex].items as JsonRecord[]).find(({ id }) => id === taskId));
    expect(task(1, "check-100")).toMatchObject({ isCompleted: true });
    expect(task(0, "guide-long")).toMatchObject({ notes: "Read the summary first." });
    expect(await call("get_run", { runId, taskId: "check-100" })).toMatchObject({ sectionId: "checks", task: { isCompleted: true } });
  }, 120_000);

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
      permissions: ["runs:read"] as const,
    });

    const parallelCreatesPastTheCap = MAX_ACTIVE_PERSONAL_RUN_KEYS + 2;
    const results = await Promise.all(
      Array.from({ length: parallelCreatesPastTheCap }, (_, index) => insertPersonalRunKeyWithinCap(env as never, record(index))),
    );
    expect(results.filter(Boolean)).toHaveLength(MAX_ACTIVE_PERSONAL_RUN_KEYS);
    expect(await rows("SELECT id FROM personal_run_keys WHERE user_id = 'cap-user' AND revoked_at IS NULL"))
      .toHaveLength(MAX_ACTIVE_PERSONAL_RUN_KEYS);

    await env.DB.prepare("UPDATE personal_run_keys SET revoked_at = ? WHERE id = ?")
      .bind("2026-09-19T05:00:00.000Z", "cap-key-0")
      .run();
    expect(await insertPersonalRunKeyWithinCap(env as never, record(20))).toBe(true);
    expect(await insertPersonalRunKeyWithinCap(env as never, record(21))).toBe(false);
    expect(await rows("SELECT permissions FROM personal_run_keys WHERE id = 'cap-key-20'"))
      .toEqual([{ permissions: '["runs:read"]' }]);
  });
});
