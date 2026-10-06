import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { callToolWithAFreshRunKey, openAFreshMcpDatabase } from "../../../support/agentMcpOnSqlite";

import { handleChecklists } from "@functions/api/handlers/checklists";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { present } from "../../../support/elements";
import { apiErrorBody, readJson } from "../../../support/readJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

const NOW = "2026-10-01T00:00:00.000Z";
const ITEMS = JSON.stringify([{ id: "s1", title: "Section", items: [{ id: "t1", title: "Task", isCompleted: true }] }]);
const PERSONAL_LIMIT_DETAILS = { limit: 3, current: 3, resource: "active_runs", context: "personal" };

type Refusal = { status: number | "tool error"; code: unknown; details?: unknown };

let database: SqliteD1;

async function httpRefusal(request: Request): Promise<Refusal | null> {
  const response = await handleChecklists(request, apiEnvOn(database));
  if (response.status === 200) return null;
  const body = await readJson(response, apiErrorBody);
  return { status: response.status, code: body.code, details: body.details };
}

async function mcpRefusal(runId: string): Promise<Refusal | null> {
  const { result } = await callToolWithAFreshRunKey(database, "update_run", {
    runId,
    expectedRevision: 1,
    operation: "set_run_status",
    status: "in_progress",
  });
  if (!result.isError) return null;
  const { error, details } = result.structuredContent;
  return { status: "tool error", code: error, details };
}

const reopenPaths = [
  {
    path: "PUT /api/checklists/:id",
    reopen: (runId: string) => httpRefusal(apiRequest(`checklists/${runId}`, "PUT", { status: "in_progress", expected_revision: 1 })),
    atTheLimit: { status: 403, code: "limit_reached", details: PERSONAL_LIMIT_DETAILS },
    conflict: { status: 409, code: "edit_conflict" },
  },
  {
    path: "POST /api/checklists/:id/revalidate",
    reopen: (runId: string) => httpRefusal(apiRequest(`checklists/${runId}/revalidate`, "POST", { expected_revision: 1 })),
    atTheLimit: { status: 403, code: "limit_reached", details: PERSONAL_LIMIT_DETAILS },
    conflict: { status: 409, code: "edit_conflict" },
  },
  {
    path: "PUT /api/checklists/shared/:token",
    reopen: (runId: string) => {
      database.run("UPDATE checklist_runs SET is_public = 1, share_token = ? WHERE id = ?", `token-${runId}`, runId);
      return httpRefusal(apiRequest(`checklists/shared/token-${runId}`, "PUT", { status: "in_progress", expected_revision: 1 }));
    },
    atTheLimit: { status: 403, code: "limit_reached", details: PERSONAL_LIMIT_DETAILS },
    conflict: { status: 409, code: "edit_conflict" },
  },
  {
    path: "MCP update_run set_run_status",
    reopen: mcpRefusal,
    atTheLimit: { status: "tool error", code: "limit_reached", details: { limit: 3, current: 3 } },
    conflict: { status: "tool error", code: "edit_conflict" },
  },
];

function insertRun(id: string, status: "in_progress" | "completed") {
  database.run(
    `INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, completed_at, created_at,
      progress, created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public, deleted_at)
     VALUES (?, 'user-1', NULL, 'template-1', 'Run', ?, ?, ?, ?, ?, 100, 'user-1', 'user-1', 1, 1, '[]', 0, NULL)`,
    id, ITEMS, status, NOW, status === "completed" ? NOW : null, NOW,
  );
}

function scalar(query: string, ...params: string[]): unknown {
  const { value } = present(database.sqlite.prepare(query).get(...params), "the value");
  return value;
}

const activeRuns = () => scalar("SELECT count(*) AS value FROM checklist_runs WHERE user_id = 'user-1' AND status = 'in_progress' AND deleted_at IS NULL");
const statusOf = (runId: string) => scalar("SELECT status AS value FROM checklist_runs WHERE id = ?", runId);
const auditRowsFor = (runId: string) => scalar("SELECT count(*) AS value FROM audit_events WHERE resource_id = ?", runId);

describe.each(reopenPaths)("reopening a completed run on the Free plan, 2 of 3 active runs in use, through $path", ({ reopen, atTheLimit, conflict }) => {
  beforeEach(() => {
    database = openAFreshMcpDatabase();
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
    database.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'user-1@example.test', 'User', 1, ?)", NOW);
    database.run(
      `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
        created_by_user_id, content_version, deleted_at)
       VALUES ('template-1', 'user-1', 'Template', ?, 0, ?, 1, 'checklist', 'user', NULL, 'user-1', 1, NULL)`,
      ITEMS, NOW,
    );
    insertRun("active-1", "in_progress");
    insertRun("active-2", "in_progress");
    insertRun("done-1", "completed");
    insertRun("done-2", "completed");
  });

  afterEach(() => {
    database.close();
  });

  it("reopens it into the last free active run and records it once", async () => {
    await expect(reopen("done-1")).resolves.toBeNull();

    expect(statusOf("done-1")).toBe("in_progress");
    expect(activeRuns()).toBe(3);
    expect(auditRowsFor("done-1")).toBe(1);
  });

  it("refuses it with limit_reached when a concurrent reopen took the last active run after its count, inside the write", async () => {
    database.beforeNextBatch(() => database.run("UPDATE checklist_runs SET status = 'in_progress', revision = 2 WHERE id = 'done-2'"));

    await expect(reopen("done-1")).resolves.toEqual(atTheLimit);

    expect(statusOf("done-1")).toBe("completed");
    expect(activeRuns()).toBe(3);
    expect(auditRowsFor("done-1")).toBe(0);
  });

  it("still answers edit_conflict when another save changed the run while an active run was free", async () => {
    database.beforeNextBatch(() => database.run("UPDATE checklist_runs SET revision = 2 WHERE id = 'done-1'"));

    expect(await reopen("done-1")).toEqual(expect.objectContaining(conflict));

    expect(statusOf("done-1")).toBe("completed");
    expect(auditRowsFor("done-1")).toBe(0);
  });
});
