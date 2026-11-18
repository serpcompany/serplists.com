import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { checklistsRefusal, insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember, insertOrganizationRun, runColumns } from "../../../support/organizationRunsOnSqlite";
import { apiRequest } from "../../../support/apiRequest";
import type { SqliteD1 } from "../../../support/sqlite-d1";

const ARCHIVED_AT = "2026-10-02T00:00:00.000Z";
let database: SqliteD1;

const auditActions = () => database.rows("SELECT action FROM audit_events");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
});

afterEach(() => {
  database.sqlite.close();
});

describe("restoring a deleted run the user may not restore", () => {
  it("answers 400 for the run id the path keeps for the collection", async () => {
    expect(await checklistsRefusal(database, apiRequest("checklists/checklists/restore", "POST")))
      .toMatchObject({ status: 400, message: "Checklist ID required" });
  });

  it("answers 404 for a run that does not exist", async () => {
    expect(await checklistsRefusal(database, apiRequest("checklists/run-missing/restore", "POST")))
      .toMatchObject({ status: 404, message: "Checklist not found" });
  });

  it("answers 404 to another user's Personal run and leaves it deleted", async () => {
    insertOwnedRun(database, { id: "run-1", status: "completed", items: "[]" });
    database.run("UPDATE checklist_runs SET deleted_at = ? WHERE id = 'run-1'", ARCHIVED_AT);
    sessionMocks.getSessionUserId.mockResolvedValue("user-2");

    expect(await checklistsRefusal(database, apiRequest("checklists/run-1/restore", "POST")))
      .toMatchObject({ status: 404, message: "Checklist not found" });
    expect(runColumns(database, "run-1")).toEqual([{ deleted_at: ARCHIVED_AT, is_public: 0, share_token: null }]);
  });

  it("answers 403 to an Organization editor, who can see the run but not restore it", async () => {
    addOrganizationWithMember(database, "editor");
    insertOrganizationRun(database, { id: "run-1", status: "completed", deletedAt: ARCHIVED_AT });

    expect(await checklistsRefusal(database, apiRequest("checklists/run-1/restore", "POST")))
      .toMatchObject({ status: 403, message: "Forbidden" });
    expect(runColumns(database, "run-1")).toEqual([{ deleted_at: ARCHIVED_AT, is_public: 0, share_token: null }]);
    expect(auditActions()).toEqual([]);
  });

  it("lets an Organization admin restore a completed run, which counts against no active-run limit", async () => {
    addOrganizationWithMember(database, "admin");
    insertOrganizationRun(database, { id: "run-1", status: "completed", deletedAt: ARCHIVED_AT });

    expect(await checklistsRefusal(database, apiRequest("checklists/run-1/restore", "POST"))).toBeNull();
    expect(runColumns(database, "run-1")).toEqual([{ deleted_at: null, is_public: 0, share_token: null }]);
    expect(auditActions()).toEqual([{ action: "checklist_run.restored" }]);
  });
});

describe("deleting a run the user may not delete", () => {
  it("answers 404 for a run that does not exist", async () => {
    expect(await checklistsRefusal(database, apiRequest("checklists/run-missing", "DELETE")))
      .toMatchObject({ status: 404, message: "Checklist not found or unauthorized" });
  });

  it("answers 403 to an Organization editor and keeps the run and its share link", async () => {
    addOrganizationWithMember(database, "editor");
    insertOrganizationRun(database, { id: "run-1", status: "in_progress", deletedAt: null, isPublic: true });

    expect(await checklistsRefusal(database, apiRequest("checklists/run-1", "DELETE")))
      .toMatchObject({ status: 403, message: "Forbidden" });
    expect(runColumns(database, "run-1")).toEqual([{ deleted_at: null, is_public: 1, share_token: "token-run-1" }]);
    expect(auditActions()).toEqual([]);
  });
});
