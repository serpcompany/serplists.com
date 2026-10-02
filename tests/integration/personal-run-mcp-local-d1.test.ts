import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { onlyElement } from "../support/elements";
import {
  applyMigration,
  bodyOf,
  callTool,
  env,
  keyId,
  mcpRequest,
  migration25,
  migration27,
  rawKey,
  rows,
  startLocalD1BeforeTheRunKeyMigrations,
  stopLocalD1,
  toolError,
  toolPayload,
  sendRequestsWithRunKey,
  type JsonRecord,
} from "../support/personalRunMcpLocalD1";
import { handleAgentMcp } from "../../functions/api/handlers/agentMcp";
import {
  createPersonalRunKeySecret,
  insertPersonalRunKeyWithinCap,
  MAX_ACTIVE_PERSONAL_RUN_KEYS,
} from "../../functions/api/utils/personal-run-key";
import { optionalRecordIn, recordIn, recordsIn, textIn } from "../support/mcpResponses";
import { storedSectionsIn } from "../support/storedJson";
import { contentAt, subTaskAt, taskIn } from "../support/elements";

let runId = "";

const auditEventsOfTheRun = async () => onlyElement(await rows<{ count: number }>(
  "SELECT count(*) AS count FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ?",
  runId,
)).count;

describe.sequential("Personal Run Key MCP against real local D1", () => {
  beforeAll(startLocalD1BeforeTheRunKeyMigrations, 60_000);
  afterAll(stopLocalD1);

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
    sendRequestsWithRunKey(secret.key);
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

    const toolsBody = await bodyOf(await handleAgentMcp(mcpRequest("tools/list"), env));
    expect(recordsIn(recordIn(toolsBody.result).tools).map(({ name }) => name)).toEqual([
      "list_templates",
      "get_template",
      "start_run",
      "list_runs",
      "get_run",
      "update_run",
    ]);

    const listBody = await bodyOf(await callTool("list_templates"));
    expect(recordsIn(toolPayload(listBody).templates).map(({ id }) => id)).toEqual(["template-a"]);

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
    const startedRun = recordIn(toolPayload(startBody).run);
    expect(startedRun).toMatchObject({ title: "Local D1 MCP Trial", revision: 1, progress: 0 });
    runId = textIn(startedRun.id);

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

    const storedRun = onlyElement(await rows<JsonRecord>("SELECT * FROM checklist_runs WHERE id = ?", runId));
    expect(storedRun).toMatchObject({
      user_id: "user-a",
      team_id: null,
      title: "Local D1 MCP Trial",
      revision: 3,
      progress: 33,
    });
    const sections = storedSectionsIn(storedRun.items);
    expect(taskIn(sections, 0, 0)).toMatchObject({
      notes: "Verified against the disposable local D1 database.",
      isCompleted: false,
    });
    expect(subTaskAt(contentAt(taskIn(sections, 0, 0), 0), 0).isCompleted).toBe(true);

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
    const auditEventsBefore = await auditEventsOfTheRun();

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

    const storedRun = onlyElement(await rows<JsonRecord>("SELECT revision FROM checklist_runs WHERE id = ?", runId));
    expect(storedRun.revision).toBe(4);
    expect(await auditEventsOfTheRun()).toBe(auditEventsBefore + 1);
  });

  it("rolls a run mutation back when its audit insert fails", async () => {
    const [beforeRun] = await rows<JsonRecord>(
      "SELECT items, progress, revision, updated_at FROM checklist_runs WHERE id = ?",
      runId,
    );
    const auditEventsBefore = await auditEventsOfTheRun();
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
      expect(optionalRecordIn(body.error)?.code).toBe(-32603);
    } finally {
      await env.DB.prepare("DROP TRIGGER reject_test_mcp_audit").run();
    }

    expect(await rows(
      "SELECT items, progress, revision, updated_at FROM checklist_runs WHERE id = ?",
      runId,
    )).toEqual([beforeRun]);
    expect(await auditEventsOfTheRun()).toBe(auditEventsBefore);
  });

  it("holds a Free owner to the active run limit under concurrent start_run calls", async () => {
    const freeLimit = 3;
    const activeRuns = async () => onlyElement(await rows<{ count: number }>(`
      SELECT count(*) AS count FROM checklist_runs
      WHERE user_id = 'user-a' AND team_id IS NULL AND status = 'in_progress' AND deleted_at IS NULL
    `)).count;
    const createdAudits = async () => onlyElement(await rows<{ count: number }>(
      "SELECT count(*) AS count FROM audit_events WHERE action = 'checklist_run.created' AND actor_user_id = 'user-a'",
    )).count;
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

  it("revokes immediately and cascades keys only with their owning user", async () => {
    await env.DB.prepare("UPDATE personal_run_keys SET revoked_at = ? WHERE id = ?")
      .bind("2026-09-19T03:00:00.000Z", keyId)
      .run();
    const denied = await handleAgentMcp(mcpRequest("tools/list"), env);
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
      Array.from({ length: parallelCreatesPastTheCap }, (_, index) => insertPersonalRunKeyWithinCap(env, record(index))),
    );
    expect(results.filter(Boolean)).toHaveLength(MAX_ACTIVE_PERSONAL_RUN_KEYS);
    expect(await rows("SELECT id FROM personal_run_keys WHERE user_id = 'cap-user' AND revoked_at IS NULL"))
      .toHaveLength(MAX_ACTIVE_PERSONAL_RUN_KEYS);

    await env.DB.prepare("UPDATE personal_run_keys SET revoked_at = ? WHERE id = ?")
      .bind("2026-09-19T05:00:00.000Z", "cap-key-0")
      .run();
    expect(await insertPersonalRunKeyWithinCap(env, record(20))).toBe(true);
    expect(await insertPersonalRunKeyWithinCap(env, record(21))).toBe(false);
    expect(await rows("SELECT permissions FROM personal_run_keys WHERE id = 'cap-key-20'"))
      .toEqual([{ permissions: '["runs:read"]' }]);
  });
});
