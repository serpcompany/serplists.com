import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../support/mockedSession";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember } from "../../../support/organizationRunsOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

const cloneRequest = (body: string | null) =>
  new Request("http://localhost/api/templates/template-1/clone", { method: "POST", ...(body === null ? {} : { body }) });

const copies = () =>
  database.rows("SELECT owner_type, team_id, is_public, seo_title FROM templates WHERE id <> 'template-1'");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  database.run("UPDATE templates SET is_public = 1, slug = 'template' WHERE id = 'template-1'");
});

afterEach(() => {
  database.sqlite.close();
});

describe("copying a public Template", () => {
  it("copies into the Organization named under team_id, public when asked to preserve the source's visibility", async () => {
    addOrganizationWithMember(database, "editor");

    const response = await handleTemplates(cloneRequest(JSON.stringify({ team_id: " team-1 ", visibility: "preserve" })), apiEnvOn(database));

    expect(response.status).toBe(200);
    expect(copies()).toEqual([{ owner_type: "team", team_id: "team-1", is_public: 1, seo_title: "" }]);
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["no body", null],
    ["a visibility it does not know", JSON.stringify({ visibility: "everyone" })],
  ])("makes a private Personal copy for a Pro user who sends %s", async (_label, body) => {
    database.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', '2026-10-01T00:00:00.000Z')");

    const response = await handleTemplates(cloneRequest(body), apiEnvOn(database));

    expect(response.status).toBe(200);
    expect(copies()).toEqual([{ owner_type: "user", team_id: null, is_public: 0, seo_title: "" }]);
  });
});
