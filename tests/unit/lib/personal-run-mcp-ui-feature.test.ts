import { describe, expect, it } from "vitest";

import { isPersonalRunMcpUiEnabled } from "@/env";

describe("Personal Run MCP UI feature gate", () => {
  it("defaults on locally and off remotely", () => {
    expect(isPersonalRunMcpUiEnabled("localhost")).toBe(true);
    expect(isPersonalRunMcpUiEnabled("127.0.0.1")).toBe(true);
    expect(isPersonalRunMcpUiEnabled("staging.serplists.com")).toBe(false);
    expect(isPersonalRunMcpUiEnabled("serplists.com")).toBe(false);
  });
});
