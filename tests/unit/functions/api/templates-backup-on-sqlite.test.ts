import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import "../../../support/mockedSession";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember } from "../../../support/organizationRunsOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, readJson } from "../../../support/readJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

const importSummary = z.object({
  imported: z.number(),
  failed: z.array(z.object({ index: z.number(), code: z.string(), reason: z.string() }).passthrough()),
}).passthrough();
let database: SqliteD1;

const importInto = (body: unknown, query = "") =>
  handleTemplates(apiRequest(`templates/backup${query}`, "POST", body), apiEnvOn(database));
const importedTemplates = () =>
  database.rows("SELECT title, is_public FROM templates WHERE id <> 'template-1' ORDER BY title");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
});

afterEach(() => {
  database.sqlite.close();
});

describe("template import and export for an Organization on the Free plan", () => {
  it.each(["GET", "POST"])("answers %s with upgrade_required, whatever the space around the id", async (method) => {
    addOrganizationWithMember(database, "admin");

    const response = await handleTemplates(apiRequest("templates/backup?teamId=%20team-1%20", method), apiEnvOn(database));

    expect(response.status).toBe(403);
    expect(await readJson(response, apiErrorBody)).toMatchObject({ code: "upgrade_required" });
  });

  it.each([["GET", undefined], ["POST", []]])("answers %s for an Organization the member may not add Templates to with 403, and imports nothing", async (method, body) => {
    addOrganizationWithMember(database, "viewer");

    const response = await handleTemplates(apiRequest("templates/backup?teamId=team-1", method, body), apiEnvOn(database));

    expect(response.status).toBe(403);
    expect(await readJson(response, apiErrorBody)).toMatchObject({ error: "Forbidden" });
    expect(importedTemplates()).toEqual([]);
  });

  it("answers for an Organization the user is not in with 404", async () => {
    const response = await handleTemplates(apiRequest("templates/backup?teamId=team-9", "GET"), apiEnvOn(database));

    expect(response.status).toBe(404);
    expect(await readJson(response, apiErrorBody)).toMatchObject({ error: "Organization not found" });
  });
});

describe("template import for a Pro user", () => {
  beforeEach(() => {
    database.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', '2026-10-01T00:00:00.000Z')");
  });

  it("reads a file that is a bare list of Templates, keeping the visibility each one names in its older fields", async () => {
    const response = await importInto([
      { title: "Shared one", is_public: true, sections: [] },
      { title: "Shared two", isPublic: true, sections: [] },
      { title: "Unshared", sections: [] },
    ]);

    expect((await readJson(response, importSummary)).imported).toBe(3);
    expect(importedTemplates()).toEqual([
      { title: "Shared one", is_public: 1 },
      { title: "Shared two", is_public: 1 },
      { title: "Unshared", is_public: 0 },
    ]);
  });

  it("refuses a Template whose sections share an id and imports the rest", async () => {
    const response = await importInto({
      templates: [
        { title: "Broken", sections: [{ id: "s1", title: "A", items: [] }, { id: "s1", title: "B", items: [] }] },
        { title: "Fine", sections: [] },
      ],
    });

    const summary = await readJson(response, importSummary);
    expect(summary.imported).toBe(1);
    expect(summary.failed).toEqual([{ index: 0, title: "Broken", reason: "Duplicate section id: s1", code: "invalid_sections" }]);
    expect(importedTemplates()).toEqual([{ title: "Fine", is_public: 0 }]);
  });

  it("makes every imported Template public when the import asks for it, whatever the file says", async () => {
    const response = await importInto({
      templates: [{ title: "Unshared", is_public: false, sections: [] }, { title: "Unmarked", sections: [] }],
      options: { visibility: "public" },
    });

    expect((await readJson(response, importSummary)).imported).toBe(2);
    expect(importedTemplates()).toEqual([{ title: "Unmarked", is_public: 1 }, { title: "Unshared", is_public: 1 }]);
  });

  it("refuses a file that is not JSON, and imports nothing", async () => {
    const response = await handleTemplates(new Request("http://localhost/api/templates/backup", { method: "POST", body: "[{" }), apiEnvOn(database));

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toBe("Invalid JSON payload");
    expect(importedTemplates()).toEqual([]);
  });

  it("refuses a file whose Templates are not a list, and imports nothing", async () => {
    const response = await importInto({ templates: "Shared one" });

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toBe("Expected array, received string");
    expect(importedTemplates()).toEqual([]);
  });

  it("backs up a Template that has no slug and was never edited with an empty slug, updated when it was created", async () => {
    const response = await handleTemplates(apiRequest("templates/backup?format=backup"), apiEnvOn(database));
    const backup = await readJson(response, z.object({
      exportedBy: z.unknown(),
      templates: z.array(z.object({ id: z.string(), slug: z.unknown(), createdAt: z.unknown(), updatedAt: z.unknown() }).passthrough()),
    }).passthrough());

    expect(backup.exportedBy).toBe("user-1@example.test");
    expect(backup.templates.map(({ id, slug, createdAt, updatedAt }) => ({ id, slug, updated: updatedAt === createdAt })))
      .toEqual([{ id: "template-1", slug: "", updated: true }]);
  });

  it("answers a method it does not serve with 405", async () => {
    const response = await handleTemplates(apiRequest("templates/backup", "PUT", {}), apiEnvOn(database));

    expect(response.status).toBe(405);
  });
});
