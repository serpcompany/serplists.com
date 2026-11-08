import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember, insertOrganizationTemplate, templateDeletedAt } from "../../../support/organizationRunsOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, readJson } from "../../../support/readJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";
import { anyInstanceOf } from "../../../support/asymmetricMatchers";

const ARCHIVED_AT = "2026-10-02T00:00:00.000Z";
let database: SqliteD1;

async function refusal(request: Request) {
  const response = await handleTemplates(request, apiEnvOn(database));
  return { status: response.status, error: (await readJson(response, apiErrorBody)).error };
}

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
});

afterEach(() => {
  database.sqlite.close();
});

describe("template writes from a signed-out visitor", () => {
  beforeEach(() => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);
  });

  it.each([
    ["POST", "templates/backup"],
    ["POST", "templates"],
    ["PUT", "templates/template-1"],
    ["DELETE", "templates/template-1"],
  ])("answer %s /api/%s with 401 and change no Template", async (method, path) => {
    expect(await refusal(apiRequest(path, method, {}))).toEqual({ status: 401, error: "Unauthorized" });
    expect(templateDeletedAt(database, "template-1")).toEqual([{ deleted_at: null }]);
  });
});

describe("template routes that name no Template", () => {
  it.each([
    ["PUT", "templates"],
    ["PUT", "templates/"],
    ["DELETE", "templates"],
    ["POST", "templates/templates/restore"],
  ])("answer %s /api/%s with 400", async (method, path) => {
    expect(await refusal(apiRequest(path, method, {}))).toEqual({ status: 400, error: "Template ID required" });
  });

  it("answers a method it does not serve with 405", async () => {
    const response = await handleTemplates(apiRequest("templates/template-1", "PATCH", {}), apiEnvOn(database));

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });
});

describe("template writes whose body is not JSON", () => {
  it.each([
    ["POST", "templates"],
    ["POST", "templates/template-1/transfer"],
    ["PUT", "templates/template-1"],
  ])("answer %s /api/%s with 400 and change no Template", async (method, path) => {
    const request = new Request(`http://localhost/api/${path}`, { method, body: "{not json" });

    expect(await refusal(request)).toEqual({ status: 400, error: "Invalid JSON payload" });
    expect(templateDeletedAt(database, "template-1")).toEqual([{ deleted_at: null }]);
  });
});

describe("deleting and restoring a Template the user may not change", () => {
  it.each([
    ["DELETE", "templates/template-missing", "Template not found or unauthorized"],
    ["POST", "templates/template-missing/restore", "Template not found"],
  ])("answers %s /api/%s with 404", async (method, path, error) => {
    expect(await refusal(apiRequest(path, method))).toEqual({ status: 404, error });
  });

  it("refuses an Organization viewer's delete and keeps the Template", async () => {
    addOrganizationWithMember(database, "viewer");
    insertOrganizationTemplate(database, { id: "template-team", deletedAt: null });

    expect(await refusal(apiRequest("templates/template-team", "DELETE"))).toEqual({ status: 403, error: "Forbidden" });
    expect(templateDeletedAt(database, "template-team")).toEqual([{ deleted_at: null }]);
  });

  it("refuses an Organization viewer's restore and keeps the Template deleted", async () => {
    addOrganizationWithMember(database, "viewer");
    insertOrganizationTemplate(database, { id: "template-team", deletedAt: ARCHIVED_AT });

    expect(await refusal(apiRequest("templates/template-team/restore", "POST"))).toEqual({ status: 403, error: "Forbidden" });
    expect(templateDeletedAt(database, "template-team")).toEqual([{ deleted_at: ARCHIVED_AT }]);
  });

  it("refuses a restore that would take a Free Organization past its Template limit", async () => {
    addOrganizationWithMember(database, "admin");
    insertOrganizationTemplate(database, { id: "template-live", deletedAt: null });
    insertOrganizationTemplate(database, { id: "template-team", deletedAt: ARCHIVED_AT });

    expect((await refusal(apiRequest("templates/template-team/restore", "POST"))).status).toBe(403);
    expect(templateDeletedAt(database, "template-team")).toEqual([{ deleted_at: ARCHIVED_AT }]);
  });
});

it("lets an Organization admin delete and then restore its Template", async () => {
  addOrganizationWithMember(database, "admin");
  insertOrganizationTemplate(database, { id: "template-team", deletedAt: null });
  const env = apiEnvOn(database);

  expect((await handleTemplates(apiRequest("templates/template-team", "DELETE"), env)).status).toBe(200);
  expect(templateDeletedAt(database, "template-team")).toEqual([{ deleted_at: anyInstanceOf(String) }]);
  expect((await handleTemplates(apiRequest("templates/template-team/restore", "POST"), env)).status).toBe(200);
  expect(templateDeletedAt(database, "template-team")).toEqual([{ deleted_at: null }]);
});
