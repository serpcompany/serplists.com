import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../support/mockedSession";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember, insertOrganizationTemplate } from "../../../support/organizationRunsOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, jsonObject, readJson } from "../../../support/readJson";
import { logLineIn } from "../../../support/storedJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

const save = (body: unknown, templateId = "template-1") =>
  handleTemplates(apiRequest(`templates/${templateId}`, "PUT", body), apiEnvOn(database));
async function refusal(body: unknown, templateId = "template-1") {
  const response = await save(body, templateId);
  const { error, code } = await readJson(response, apiErrorBody);
  return { status: response.status, error, code };
}
const stored = () => database.rows("SELECT title, slug, version FROM templates WHERE id = 'template-1'");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  database.run("UPDATE templates SET slug = 'template' WHERE id = 'template-1'");
});

afterEach(() => {
  vi.restoreAllMocks();
  database.sqlite.close();
});

describe("saving a Template, refused before anything is written", () => {
  it.each([
    ["a visibility that is not true or false", { is_public: "yes", expected_version: 1 }, "is_public: Expected boolean, received string"],
    ["no field to change", { expected_version: 1 }, "No fields to update"],
    ["only the slug it already has", { slug: "template", expected_version: 1 }, "No fields to update"],
    [
      "two sections with one id",
      { sections: [{ id: "s1", title: "A", items: [] }, { id: "s1", title: "B", items: [] }], expected_version: 1 },
      "Duplicate section id: s1",
    ],
  ])("answers 400 to %s", async (_label, body, error) => {
    expect(await refusal(body)).toMatchObject({ status: 400, error });
    expect(stored()).toEqual([{ title: "Template", slug: "template", version: 1 }]);
  });

  it("answers 404 for a Template that does not exist", async () => {
    expect(await refusal({ title: "Renamed", expected_version: 1 }, "template-missing"))
      .toMatchObject({ status: 404, error: "Template not found or unauthorized" });
  });

  it("answers 403 to an Organization viewer and keeps the Organization's Template", async () => {
    addOrganizationWithMember(database, "viewer");
    insertOrganizationTemplate(database, { id: "template-team", deletedAt: null });

    expect(await refusal({ title: "Renamed", expected_version: 1 }, "template-team")).toMatchObject({ status: 403, error: "Forbidden" });
    expect(database.rows("SELECT title FROM templates WHERE id = 'template-team'")).toEqual([{ title: "Organization template" }]);
  });

  it("answers 409 when another Template takes the requested slug while the save is written", async () => {
    addOrganizationWithMember(database, "admin");
    insertOrganizationTemplate(database, { id: "template-other", deletedAt: null });
    database.beforeNextBatch(async () => {
      database.run("UPDATE templates SET slug = 'launch-plan' WHERE id = 'template-other'");
    });

    expect(await refusal({ slug: "launch-plan", expected_version: 1 })).toMatchObject({ status: 409, code: "slug_taken" });
    expect(stored()).toEqual([{ title: "Template", slug: "template", version: 1 }]);
  });
});

describe("saves that change what is stored", () => {
  it("answers a save that repeats the stored title as saved, keeping the version", async () => {
    const response = await save({ title: "Template", expected_version: 1 });

    expect(response.status).toBe(200);
    expect(await readJson(response, jsonObject)).toMatchObject({ version: 1, structureChanged: false, reconciledRuns: 0 });
    expect(stored()).toEqual([{ title: "Template", slug: "template", version: 1 }]);
  });

  it("renames a Template to a title the tests of old left behind, and warns about it in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect((await save({ title: "Updated Template Title", expected_version: 1 })).status).toBe(200);
    expect(stored()).toEqual([{ title: "Updated Template Title", slug: "template", version: 2 }]);
    expect(warn.mock.calls.map(([line]) => logLineIn(line).message)).toContain("junk_template_title_updated");
  });
});
