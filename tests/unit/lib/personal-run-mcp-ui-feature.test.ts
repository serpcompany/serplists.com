import { describe, expect, it } from "vitest";

import { isPersonalRunMcpUiEnabled } from "@/env";

describe("Personal Run MCP UI feature gate", () => {
  it("defaults on locally and off remotely", () => {
    expect(isPersonalRunMcpUiEnabled("localhost")).toBe(true);
    expect(isPersonalRunMcpUiEnabled("127.0.0.1")).toBe(true);
    expect(isPersonalRunMcpUiEnabled("staging.serplists.com")).toBe(false);
    expect(isPersonalRunMcpUiEnabled("serplists.com")).toBe(false);
  });

  it("defaults on for IPv6 loopback as browsers report it", () => {
    // location.hostname keeps the brackets, like URL.hostname.
    expect(isPersonalRunMcpUiEnabled(new URL("http://[::1]:5173/dashboard/settings").hostname)).toBe(true);
    expect(isPersonalRunMcpUiEnabled("::1")).toBe(true);
  });
});
