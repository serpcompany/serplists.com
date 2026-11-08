import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../support/mockedSession";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember, insertOrganizationTemplate } from "../../../support/organizationRunsOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, readJson } from "../../../support/readJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

async function transfer(body: unknown) {
  const response = await handleTemplates(apiRequest("templates/template-1/transfer", "POST", body), apiEnvOn(database));
  return { status: response.status, body: await readJson(response, apiErrorBody) };
}
const templateOwner = () => database.rows("SELECT owner_type, team_id, version FROM templates WHERE id = 'template-1'");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  addOrganizationWithMember(database, "admin");
});

afterEach(() => {
  database.sqlite.close();
});

describe("moving a Personal Template to an Organization when another write lands first", () => {
  it("answers 409 naming the newer version when the Template is saved meanwhile", async () => {
    database.beforeNextBatch(async () => {
      database.run("UPDATE templates SET version = 2 WHERE id = 'template-1'");
    });

    expect(await transfer({ teamId: "team-1", expected_version: 1 })).toEqual({
      status: 409,
      body: {
        error: "Template changed since it was loaded. Refresh before transferring it.",
        code: "edit_conflict",
        details: { expectedVersion: 1, currentVersion: 2 },
      },
    });
    expect(templateOwner()).toEqual([{ owner_type: "user", team_id: null, version: 2 }]);
  });

  it("answers with the Template limit when the Free Organization fills up meanwhile", async () => {
    database.beforeNextBatch(async () => {
      insertOrganizationTemplate(database, { id: "template-team", deletedAt: null });
    });

    const refused = await transfer({ teamId: "team-1", expected_version: 1 });

    expect(refused).toMatchObject({ status: 403, body: { code: "limit_reached" } });
    expect(templateOwner()).toEqual([{ owner_type: "user", team_id: null, version: 1 }]);
  });
});

it("answers 404 to moving a deleted Template", async () => {
  database.run("UPDATE templates SET deleted_at = '2026-10-02T00:00:00.000Z' WHERE id = 'template-1'");

  expect(await transfer({ teamId: "team-1", expected_version: 1 })).toMatchObject({ status: 404, body: { error: "Template not found" } });
});
