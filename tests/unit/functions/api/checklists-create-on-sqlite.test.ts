import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../support/mockedSession";
import { checklistsRefusal, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember } from "../../../support/organizationRunsOnSqlite";
import { apiRequest } from "../../../support/apiRequest";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

const start = (body: unknown) => checklistsRefusal(database, apiRequest("checklists", "POST", body));
const storedRuns = () => database.rows("SELECT title, items, team_id, template_version FROM checklist_runs");

beforeEach(() => {
  database = openRunOwnerDatabase("not json");
});

afterEach(() => {
  database.sqlite.close();
});

describe("starting a run, refused before anything is written", () => {
  it("answers 404 for a Template that does not exist", async () => {
    expect(await start({ template_id: "template-missing" })).toMatchObject({ status: 404, message: "Template not found" });
    expect(storedRuns()).toEqual([]);
  });

  it("answers 400 for a status a new run cannot have", async () => {
    expect(await start({ title: "Run", status: "paused" })).toMatchObject({ status: 400 });
    expect(storedRuns()).toEqual([]);
  });

  it("answers 400 for sections that are not a list", async () => {
    expect(await start({ title: "Run", sections: "nope" }))
      .toMatchObject({ status: 400, message: "sections/items must be a JSON array" });
    expect(storedRuns()).toEqual([]);
  });

  it("answers 404 for an Organization the user is not a member of", async () => {
    expect(await start({ title: "Run", teamId: "team-elsewhere" })).toMatchObject({ status: 404, message: "Organization not found" });
    expect(storedRuns()).toEqual([]);
  });

  it("answers 403 to an Organization viewer, who may not start runs", async () => {
    addOrganizationWithMember(database, "viewer");

    expect(await start({ title: "Run", teamId: "team-1" })).toMatchObject({ status: 403, message: "Forbidden" });
    expect(storedRuns()).toEqual([]);
  });
});

it("starts an untitled run when neither the request nor a Template names it", async () => {
  expect(await start({ sections: [] })).toBeNull();
  expect(storedRuns()).toEqual([{ title: "", items: "[]", team_id: null, template_version: 1 }]);
});

it("starts an empty run named for the Template when the Template's stored content cannot be read", async () => {
  expect(await start({ template_id: "template-1" })).toBeNull();
  expect(storedRuns()).toEqual([{ title: "Template", items: "[]", team_id: null, template_version: 1 }]);
});
