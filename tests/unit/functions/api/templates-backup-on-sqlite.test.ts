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

  it("answers a method it does not serve with 405", async () => {
    const response = await handleTemplates(apiRequest("templates/backup", "PUT", {}), apiEnvOn(database));

    expect(response.status).toBe(405);
  });
});
