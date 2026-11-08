import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../support/mockedSession";
import { checklistsRefusal, insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { apiRequest } from "../../../support/apiRequest";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

const revalidate = (body?: unknown) => checklistsRefusal(database, apiRequest("checklists/run-1/revalidate", "POST", body));
const storedRun = () => database.rows("SELECT revision, template_version FROM checklist_runs WHERE id = 'run-1'");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  insertOwnedRun(database, { id: "run-1", status: "in_progress", items: "[]" });
});

afterEach(() => {
  database.sqlite.close();
});

describe("revalidating a run against its Template, refused before anything is written", () => {
  it.each([
    ["a revision that is not a whole number", { expected_revision: 1.5 }, "Expected integer, received float"],
    ["a revision given as text", { expected_revision: "1" }, "Expected number, received string"],
  ])("answers 400 for %s, saying what was wrong", async (_label, body, message) => {
    expect(await revalidate(body)).toMatchObject({ status: 400, message });
    expect(storedRun()).toEqual([{ revision: 1, template_version: 1 }]);
  });

  it("answers 400 for a run no longer linked to a Template", async () => {
    database.run("UPDATE checklist_runs SET template_id = NULL WHERE id = 'run-1'");

    expect(await revalidate({})).toMatchObject({ status: 400, message: "Checklist run is not linked to a template." });
  });

  it("answers 409 to a page that loaded an older revision, naming both", async () => {
    expect(await revalidate({ expected_revision: 3 })).toEqual({
      status: 409,
      code: "edit_conflict",
      message: "Checklist run changed since it was loaded. Refresh before revalidating.",
      details: { expectedRevision: 3, currentRevision: 1 },
    });
    expect(storedRun()).toEqual([{ revision: 1, template_version: 1 }]);
  });

  it("rebuilds a run whose stored sections cannot be read from its Template", async () => {
    database.run("UPDATE checklist_runs SET items = 'not json', retired_items = 'not json' WHERE id = 'run-1'");
    database.run("UPDATE templates SET items = ? WHERE id = 'template-1'", JSON.stringify([{ id: "s1", title: "Launch", items: [] }]));

    expect(await revalidate({ expected_revision: 1 })).toBeNull();
    expect(database.rows("SELECT items, retired_items FROM checklist_runs WHERE id = 'run-1'"))
      .toEqual([{ items: JSON.stringify([{ id: "s1", title: "Launch", items: [] }]), retired_items: "[]" }]);
  });

  it("revalidates a request with no body against the current revision", async () => {
    database.run("UPDATE templates SET content_version = 2 WHERE id = 'template-1'");

    expect(await revalidate()).toBeNull();
    expect(storedRun()).toEqual([{ revision: 2, template_version: 2 }]);
  });
});
