import { describe, expect, it } from "vitest";

import { buildToolInvocation } from "../../../scripts/lib/run-tool.mjs";

describe("buildToolInvocation called from a JavaScript script, where no type limits the tool name", () => {
  it("rejects tools it does not know", () => {
    expect(() => buildToolInvocation("npx", [])).toThrow(/Unknown tool "npx"/);
  });
});
