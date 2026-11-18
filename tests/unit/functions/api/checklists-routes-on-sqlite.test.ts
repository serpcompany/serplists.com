import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { checklistsRefusal, insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { handleChecklists } from "@functions/api/handlers/checklists";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

const runRows = () => database.rows("SELECT id, deleted_at, title FROM checklist_runs ORDER BY id");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  database.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-2', 'user-2@example.test', 'Other', 1, '2026-10-01T00:00:00.000Z')");
  insertOwnedRun(database, { id: "run-1", status: "in_progress", items: "[]" });
});

afterEach(() => {
  database.sqlite.close();
});

describe("the checklists routes a client can reach without naming a run", () => {
  it("asks for a share token on the shared route without one, signed in or not", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);

    expect(await checklistsRefusal(database, apiRequest("checklists/shared"))).toEqual({
      status: 400, code: undefined, message: "Share token required", details: undefined,
    });
  });

  it.each([
    ["PUT", "checklists"],
    ["PUT", "checklists/checklists"],
    ["DELETE", "checklists"],
    ["DELETE", "checklists/checklists"],
  ])("answers %s /api/%s with 400 and changes no run", async (method, path) => {
    const refusal = await checklistsRefusal(database, apiRequest(path, method, { title: "Renamed" }));

    expect(refusal).toMatchObject({ status: 400, message: "Checklist ID required" });
    expect(runRows()).toEqual([{ id: "run-1", deleted_at: null, title: "Run" }]);
  });

  it("answers 400 to sharing the run id the share path keeps for itself", async () => {
    expect(await checklistsRefusal(database, apiRequest("checklists/run/run/share", "POST")))
      .toMatchObject({ status: 400, message: "Checklist run ID required" });
  });

  it("answers a method it does not serve with 405", async () => {
    const response = await handleChecklists(apiRequest("checklists/run-1", "PATCH", {}), apiEnvOn(database));

    expect(response.status).toBe(405);
    expect(await response.text()).toBe("Method Not Allowed");
  });
});

describe("reading runs the signed-in user cannot see", () => {
  it.each([
    ["a run that does not exist", "checklists/run-missing"],
    ["the history of a run that does not exist", "checklists/run-missing/history"],
  ])("answers 404 for %s", async (_label, path) => {
    expect(await checklistsRefusal(database, apiRequest(path))).toMatchObject({ status: 404, message: "Checklist not found" });
  });

  it.each([
    ["the run", "checklists/run-1"],
    ["its history", "checklists/run-1/history"],
  ])("answers 404 when another user asks for %s of a private Personal run", async (_label, path) => {
    sessionMocks.getSessionUserId.mockResolvedValue("user-2");

    expect(await checklistsRefusal(database, apiRequest(path))).toMatchObject({ status: 404, message: "Checklist not found" });
  });

  it.each(["checklists?teamId=team-1", "checklists/archived?teamId=team-1"])(
    "answers 404 to %s for an Organization the user is not a member of",
    async (path) => {
      database.run(
        `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
         VALUES ('team-1', 'Acme', 'acme', 'user-2', 'user-2', '2026-10-01T00:00:00.000Z')`,
      );

      expect(await checklistsRefusal(database, apiRequest(path))).toMatchObject({ status: 404, message: "Organization not found" });
    },
  );
});
