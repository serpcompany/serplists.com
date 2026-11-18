import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { checklistsRefusal, insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import type { SqliteD1 } from "../../../support/sqlite-d1";
import { apiRequest } from "../../../support/apiRequest";
import { apiEnvOn } from "../../../support/apiEnv";
import { handleChecklists } from "@functions/api/handlers/checklists";

const STORED_ITEMS = JSON.stringify([{ id: "section-1", title: "Launch", items: [{ id: "task-1", title: "Ship", isCompleted: false }] }]);
let database: SqliteD1;

const storedRun = () => database.rows("SELECT items, status, revision FROM checklist_runs WHERE id = 'run-1'");
const saveAsGuest = (body: unknown) => checklistsRefusal(database, apiRequest("checklists/shared/token-1", "PUT", body));

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  sessionMocks.getSessionUserId.mockResolvedValue(null);
});

afterEach(() => {
  database.sqlite.close();
});

describe("a share link guest's request the shared route refuses", () => {
  beforeEach(() => {
    insertOwnedRun(database, { id: "run-1", status: "in_progress", items: STORED_ITEMS, shareToken: "token-1" });
  });

  it.each(["POST", "DELETE"])("answers %s with 405", async (method) => {
    const response = await handleChecklists(apiRequest("checklists/shared/token-1", method), apiEnvOn(database));

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });

  it("answers a save that names neither sections nor a status with 400 and writes nothing", async () => {
    expect(await saveAsGuest({ expected_revision: 1 })).toMatchObject({ status: 400, message: "No fields to update" });
    expect(storedRun()).toEqual([{ items: STORED_ITEMS, status: "in_progress", revision: 1 }]);
  });

  it("answers a save from a stale page with 409, naming both revisions", async () => {
    expect(await saveAsGuest({ expected_revision: 4, status: "completed" })).toEqual({
      status: 409,
      code: "edit_conflict",
      message: "Checklist run changed since it was loaded. Refresh before saving again.",
      details: { expectedRevision: 4, currentRevision: 1 },
    });
    expect(storedRun()).toEqual([{ items: STORED_ITEMS, status: "in_progress", revision: 1 }]);
  });
});

it("answers 500 and writes nothing when the shared run's stored content is not a list of sections", async () => {
  insertOwnedRun(database, { id: "run-1", status: "in_progress", items: "not json", shareToken: "token-1" });

  expect(await saveAsGuest({ expected_revision: 1, status: "in_progress" }))
    .toMatchObject({ status: 500, message: "Shared run content could not be read" });
  expect(storedRun()).toEqual([{ items: "not json", status: "in_progress", revision: 1 }]);
});
