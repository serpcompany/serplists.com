import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checklistsRefusal,
  insertOwnedRun,
  openRunOwnerDatabase,
  storedValue,
  updateRunRefusal,
} from "../../../support/runOwnerOnSqlite";

import { apiRequest } from "../../../support/apiRequest";
import type { SqliteD1 } from "../../../support/sqlite-d1";

const ITEMS = JSON.stringify([{ id: "s1", title: "Section", items: [{ id: "t1", title: "Task", isCompleted: true }] }]);
const PERSONAL_LIMIT_DETAILS = { limit: 3, current: 3, resource: "active_runs", context: "personal" };

let database: SqliteD1;

const reopenPaths = [
  {
    path: "PUT /api/checklists/:id",
    reopen: (runId: string) =>
      checklistsRefusal(database, apiRequest(`checklists/${runId}`, "PUT", { status: "in_progress", expected_revision: 1 })),
    atTheLimit: { status: 403, code: "limit_reached", details: PERSONAL_LIMIT_DETAILS },
    conflict: { status: 409, code: "edit_conflict" },
  },
  {
    path: "POST /api/checklists/:id/revalidate",
    reopen: (runId: string) =>
      checklistsRefusal(database, apiRequest(`checklists/${runId}/revalidate`, "POST", { expected_revision: 1 })),
    atTheLimit: { status: 403, code: "limit_reached", details: PERSONAL_LIMIT_DETAILS },
    conflict: { status: 409, code: "edit_conflict" },
  },
  {
    path: "PUT /api/checklists/shared/:token",
    reopen: (runId: string) => {
      database.run("UPDATE checklist_runs SET is_public = 1, share_token = ? WHERE id = ?", `token-${runId}`, runId);
      return checklistsRefusal(database, apiRequest(`checklists/shared/token-${runId}`, "PUT", { status: "in_progress", expected_revision: 1 }));
    },
    atTheLimit: { status: 403, code: "limit_reached", details: PERSONAL_LIMIT_DETAILS },
    conflict: { status: 409, code: "edit_conflict" },
  },
  {
    path: "MCP update_run set_run_status",
    reopen: (runId: string) =>
      updateRunRefusal(database, { runId, expectedRevision: 1, operation: "set_run_status", status: "in_progress" }),
    atTheLimit: { status: "tool error", code: "limit_reached", details: { limit: 3, current: 3 } },
    conflict: { status: "tool error", code: "edit_conflict" },
  },
];

const activeRuns = () =>
  storedValue(database, "SELECT count(*) AS value FROM checklist_runs WHERE user_id = 'user-1' AND status = 'in_progress' AND deleted_at IS NULL");
const statusOf = (runId: string) => storedValue(database, "SELECT status AS value FROM checklist_runs WHERE id = ?", runId);
const auditRowsFor = (runId: string) => storedValue(database, "SELECT count(*) AS value FROM audit_events WHERE resource_id = ?", runId);

describe.each(reopenPaths)("reopening a completed run on the Free plan, 2 of 3 active runs in use, through $path", ({ reopen, atTheLimit, conflict }) => {
  beforeEach(() => {
    database = openRunOwnerDatabase(ITEMS);
    insertOwnedRun(database, { id: "active-1", status: "in_progress", items: ITEMS });
    insertOwnedRun(database, { id: "active-2", status: "in_progress", items: ITEMS });
    insertOwnedRun(database, { id: "done-1", status: "completed", items: ITEMS });
    insertOwnedRun(database, { id: "done-2", status: "completed", items: ITEMS });
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

    await expect(reopen("done-1")).resolves.toEqual(expect.objectContaining(atTheLimit));

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
