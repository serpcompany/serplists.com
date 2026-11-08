import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../support/mockedSession";
import { checklistsRefusal, insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { apiRequest } from "../../../support/apiRequest";
import type { SqliteD1 } from "../../../support/sqlite-d1";
import { storedSectionsIn } from "../../../support/storedJson";
import { onlyElement } from "../../../support/elements";
import { objectContaining, stringMatching } from "../../../support/asymmetricMatchers";

const STORED_ITEMS = JSON.stringify([{ id: "section-1", title: "Launch", items: [{ id: "task-1", title: "Ship", isCompleted: false }] }]);
let database: SqliteD1;

const save = (body: unknown, runId = "run-1") => checklistsRefusal(database, apiRequest(`checklists/${runId}`, "PUT", body));
const storedRun = () => onlyElement(database.rows("SELECT title, items, revision FROM checklist_runs WHERE id = 'run-1'"));

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  insertOwnedRun(database, { id: "run-1", status: "in_progress", items: STORED_ITEMS });
});

afterEach(() => {
  database.sqlite.close();
});

describe("saving a run, refused before anything is written", () => {
  it("answers 400 for a status the run cannot have", async () => {
    expect(await save({ status: "paused" })).toMatchObject({ status: 400, message: stringMatching(/^Invalid enum value/) });
    expect(storedRun()).toMatchObject({ title: "Run", revision: 1 });
  });

  it("answers 400 for a save that changes no field", async () => {
    expect(await save({ expected_revision: 1 })).toMatchObject({ status: 400, message: "No fields to update" });
  });

  it("answers 404 for a run that does not exist", async () => {
    expect(await save({ title: "Renamed" }, "run-missing")).toMatchObject({ status: 404, message: "Checklist not found" });
  });

  it("answers 409 to a page that loaded an older revision, naming both", async () => {
    expect(await save({ title: "Renamed", expected_revision: 2 })).toEqual({
      status: 409,
      code: "edit_conflict",
      message: "Checklist run changed since it was loaded. Refresh before saving again.",
      details: { expectedRevision: 2, currentRevision: 1 },
    });
    expect(storedRun()).toMatchObject({ title: "Run", revision: 1 });
  });
});

describe("saves the run accepts", () => {
  it("renames the run without a revision and leaves its sections alone", async () => {
    expect(await save({ title: "Renamed" })).toBeNull();
    expect(storedRun()).toEqual({ title: "Renamed", items: STORED_ITEMS, revision: 2 });
  });

  it("reads sections sent under the older items key", async () => {
    const ticked = [{ id: "section-1", title: "Launch", items: [{ id: "task-1", title: "Ship", isCompleted: true }] }];

    expect(await save({ items: ticked, expected_revision: 1 })).toBeNull();
    const [section] = storedSectionsIn(storedRun().items);
    expect(section?.items).toEqual([objectContaining({ id: "task-1", isCompleted: true })]);
  });

  it("saves sections over stored content that cannot be read", async () => {
    database.run("UPDATE checklist_runs SET items = 'not json' WHERE id = 'run-1'");

    expect(await save({ sections: storedSectionsIn(STORED_ITEMS), expected_revision: 1 })).toBeNull();
    expect(storedSectionsIn(storedRun().items).map(({ id }) => id)).toEqual(["section-1"]);
  });
});
