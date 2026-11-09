import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionMocks } from "../../../support/mockedSession";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, readJson } from "../../../support/readJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

async function read(path: string) {
  const response = await handleTemplates(apiRequest(path), apiEnvOn(database));
  return { status: response.status, error: (await readJson(response, apiErrorBody)).error };
}

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  database.run(
    `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
     VALUES ('team-1', 'Acme', 'acme', 'user-1', 'user-1', '2026-10-01T00:00:00.000Z')`,
  );
});

afterEach(() => {
  database.sqlite.close();
});

describe("template reads a signed-out visitor cannot make", () => {
  beforeEach(() => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);
  });

  it.each([
    "templates/archived",
    "templates/template-1/history",
    "templates?teamId=team-1",
    "templates?scope=personal",
  ])("answers GET /api/%s with 401", async (path) => {
    expect(await read(path)).toEqual({ status: 401, error: "Unauthorized" });
  });
});

describe("template reads a signed-in user is refused", () => {
  it.each(["templates/archived?teamId=team-1", "templates?teamId=team-1"])(
    "answers GET /api/%s with 404 for an Organization the user is not a member of",
    async (path) => {
      expect(await read(path)).toEqual({ status: 404, error: "Organization not found" });
    },
  );

  it("answers a slug path that is not valid percent-encoding with 404", async () => {
    expect(await read("templates/slug/%E0%A4%A")).toEqual({ status: 404, error: "Template not found" });
  });
});

describe("a profile's public Templates", () => {
  it.each([
    ["names no profile", "templates/public", 400, "userId or handle required"],
    ["names a blank handle", "templates/public?handle=%20", 400, "userId or handle required"],
    ["names a handle nobody has", "templates/public?handle=nobody", 404, "Profile not found"],
  ])("answers a request that %s with %i", async (_label, path, status, error) => {
    expect(await read(path)).toEqual({ status, error });
  });
});
