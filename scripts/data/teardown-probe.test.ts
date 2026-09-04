import { describe, expect, it } from "vitest";

import { runFixtureTeardownProbe } from "./teardown-probe";

describe("observed data teardown probe", () => {
  it("reports actual remaining fixture rows after exact cleanup", () => {
    expect(runFixtureTeardownProbe()).toEqual({
      leakedUsers: 0,
      leakedTemplates: 0,
      leakedRuns: 0,
      verdict: "pass",
    });
  });
});
