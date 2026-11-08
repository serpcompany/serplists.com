import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../support/mockedSession";
import { insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember, insertOrganizationTemplate } from "../../../support/organizationRunsOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, jsonObject, readJson } from "../../../support/readJson";
import { logLineIn, storedSectionsIn } from "../../../support/storedJson";
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

  it("answers 404 for a deleted Template and keeps it deleted", async () => {
    database.run("UPDATE templates SET deleted_at = '2026-10-02T00:00:00.000Z' WHERE id = 'template-1'");

    expect(await refusal({ title: "Renamed", expected_version: 1 })).toMatchObject({ status: 404, error: "Template not found or unauthorized" });
    expect(stored()).toEqual([{ title: "Template", slug: "template", version: 1 }]);
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

  it("answers a save that changes nothing on a Template with no slug without one", async () => {
    database.run("UPDATE templates SET slug = NULL WHERE id = 'template-1'");
    const response = await save({ title: "Template", expected_version: 1 });

    expect(response.status).toBe(200);
    expect(await readJson(response, jsonObject)).not.toHaveProperty("slug");
  });

  it("clears the rules for an empty list, and reads the content and categories older clients send as items and category", async () => {
    database.run(`UPDATE templates SET rules = '[{"id":"r1"}]' WHERE id = 'template-1'`);
    const response = await save({ rules: [], items: [{ id: "s1", title: "Packing", items: [] }], category: "camping", expected_version: 1 });

    expect(response.status).toBe(200);
    const [row] = database.rows("SELECT rules, items, category FROM templates WHERE id = 'template-1'");
    expect(row?.rules).toBeNull();
    expect(storedSectionsIn(row?.items).map(({ id }) => id)).toEqual(["s1"]);
    expect(row?.category).toBe('["camping"]');
  });

  it("saves new content over stored content that is not a list, and gives a run whose content cannot be read the new content", async () => {
    database.run(`UPDATE templates SET items = '{"legacy":true}' WHERE id = 'template-1'`);
    insertOwnedRun(database, { id: "run-1", status: "in_progress", items: "not json" });
    database.run("UPDATE checklist_runs SET retired_items = 'not json' WHERE id = 'run-1'");

    const response = await save({ sections: [{ id: "s1", title: "Packing", items: [] }], expected_version: 1 });

    expect(await readJson(response, jsonObject)).toMatchObject({ structureChanged: true, reconciledRuns: 1 });
    const [run] = database.rows("SELECT items FROM checklist_runs WHERE id = 'run-1'");
    expect(storedSectionsIn(run?.items).map(({ id }) => id)).toEqual(["s1"]);
  });

  it("passes on a write that fails for a reason it cannot answer, and keeps the stored Template", async () => {
    database.beforeNextBatch(async () => {
      throw new Error("D1_ERROR: Network connection lost");
    });

    await expect(save({ title: "Renamed", expected_version: 1 })).rejects.toThrow("Network connection lost");
    expect(stored()).toEqual([{ title: "Template", slug: "template", version: 1 }]);
  });
});
