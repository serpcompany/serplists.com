import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { checklistsRefusal, insertOwnedRun, openRunOwnerDatabase, storedValue, updateRunRefusal } from "../../../support/runOwnerOnSqlite";
import { apiRequest } from "../../../support/apiRequest";
import { onlyElement } from "../../../support/elements";
import type { SqliteD1 } from "../../../support/sqlite-d1";

const SECTION = { id: "section-1", title: "Launch", items: [{ id: "task-1", title: "Ship", isCompleted: false }] };
const STORED_ITEMS = JSON.stringify([SECTION]);
const AS_IT_WAS = { items: STORED_ITEMS, revision: "legacy", template_version: 1 };
let database: SqliteD1;

const storedRun = () => onlyElement(database.rows("SELECT items, revision, template_version FROM checklist_runs WHERE id = 'run-1'"));
const auditEventsOfTheRun = () => storedValue(database, "SELECT COUNT(*) AS value FROM audit_events WHERE resource_id = ?", "run-1");

beforeEach(() => {
  database = openRunOwnerDatabase(STORED_ITEMS);
  insertOwnedRun(database, { id: "run-1", status: "in_progress", items: STORED_ITEMS });
  database.run("UPDATE checklist_runs SET revision = 'legacy' WHERE id = 'run-1'");
});

afterEach(() => {
  database.sqlite.close();
});

describe("a run stored with text for its revision, as SQLite allows, read as revision 1 by writes guarded on revision 1", () => {
  it("refuses an MCP update with edit_conflict, and leaves the run as it was", async () => {
    const update = { runId: "run-1", expectedRevision: 1, operation: "set_task_notes", taskId: "task-1", notes: "Checked" };

    expect(await updateRunRefusal(database, update)).toEqual({
      status: "tool error",
      code: "edit_conflict",
      message: "Run changed while it was being updated; fetch it again",
    });
    expect(storedRun()).toEqual(AS_IT_WAS);
    expect(auditEventsOfTheRun()).toBe(0);
  });

  it("refuses to revalidate it with 409 edit_conflict, and leaves the run as it was", async () => {
    expect(await checklistsRefusal(database, apiRequest("checklists/run-1/revalidate", "POST", { expected_revision: 1 }))).toEqual({
      status: 409,
      code: "edit_conflict",
      message: "Checklist run changed while it was being revalidated. Refresh and try again.",
    });
    expect(storedRun()).toEqual(AS_IT_WAS);
    expect(auditEventsOfTheRun()).toBe(0);
  });

  it("refuses a share link guest's save with 409 edit_conflict, and leaves the run as it was", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);
    database.run("UPDATE checklist_runs SET is_public = 1, share_token = 'token-1' WHERE id = 'run-1'");
    const ticked = [{ ...SECTION, items: [{ id: "task-1", title: "Ship", isCompleted: true }] }];

    expect(await checklistsRefusal(database, apiRequest("checklists/shared/token-1", "PUT", { sections: ticked, expected_revision: 1 }))).toEqual({
      status: 409,
      code: "edit_conflict",
      message: "Checklist run changed while it was being saved. Refresh before saving again.",
    });
    expect(storedRun()).toEqual(AS_IT_WAS);
    expect(auditEventsOfTheRun()).toBe(0);
  });
});
