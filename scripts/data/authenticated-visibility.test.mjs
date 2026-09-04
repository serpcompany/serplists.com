import { describe, expect, it } from "vitest";

import { evaluateAuthenticatedTemplateVisibility } from "./authenticated-visibility-lib.mjs";

describe("authenticated template visibility gate evaluation", () => {
  it("passes when all account-owned database rows are present in the API payload", () => {
    expect(evaluateAuthenticatedTemplateVisibility({
      databaseOwnedIds: ["owned-template"],
      apiStatus: 200,
      apiRows: [{ id: "owned-template", user_id: "owner" }],
      ownerId: "owner",
    })).toMatchObject({ databaseOwnedCount: 1, apiVisibleCount: 1, verdict: "pass" });
  });

  it("fails when database rows exist but the API is incorrectly empty", () => {
    expect(evaluateAuthenticatedTemplateVisibility({
      databaseOwnedIds: ["owned-template"],
      apiStatus: 200,
      apiRows: [],
      ownerId: "owner",
    })).toMatchObject({
      databaseOwnedCount: 1,
      apiVisibleCount: 0,
      failure: "owned_rows_missing_from_authenticated_api",
      verdict: "fail",
    });
  });

  it("fails when account-owned rows exist but the API errors", () => {
    expect(evaluateAuthenticatedTemplateVisibility({
      databaseOwnedIds: ["owned-template"],
      apiStatus: 500,
      apiRows: null,
      ownerId: "owner",
    })).toMatchObject({
      databaseOwnedCount: 1,
      httpStatus: 500,
      failure: "authenticated_api_error",
      verdict: "fail",
    });
  });
});
