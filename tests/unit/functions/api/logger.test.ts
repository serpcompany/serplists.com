import { describe, expect, it } from "vitest";

import { describeErrorForLog } from "@functions/api/utils/logger";

describe("describeErrorForLog", () => {
  it("logs the database error a Drizzle query error wraps, never its parameters", () => {
    const error = Object.assign(
      new Error('Failed query: update "checklist_runs" set "items" = ?\nparams: {"notes":"call jane@example.com"}'),
      { cause: new Error("D1_ERROR: no such column: retired_items") },
    );

    const described = describeErrorForLog(error);

    expect(described).toEqual({ errorName: "DrizzleQueryError", errorMessage: "D1_ERROR: no such column: retired_items" });
    expect(JSON.stringify(described)).not.toContain("jane@example.com");
  });

  it("drops a params section from any other error message", () => {
    expect(describeErrorForLog(new TypeError("bad value\nparams: secret"))).toEqual({
      errorName: "TypeError",
      errorMessage: "bad value",
    });
  });

  it("bounds long messages and describes thrown non-errors", () => {
    expect(describeErrorForLog(new Error("x".repeat(1_000))).errorMessage).toHaveLength(301);
    expect(describeErrorForLog("plain failure")).toEqual({ errorName: "string", errorMessage: "plain failure" });
  });
});
