import { describe, expect, it } from "vitest";

import {
  isPersonalRunMcpEnabled,
  isPersonalRunMcpPath,
} from "@functions/api/utils/personal-run-mcp-feature";

describe("personal run MCP feature gate", () => {
  it("defaults on locally and off remotely", () => {
    expect(isPersonalRunMcpEnabled({} as never, new URL("http://localhost/api/mcp"))).toBe(true);
    expect(isPersonalRunMcpEnabled({} as never, new URL("http://127.0.0.1:8788/api/mcp"))).toBe(true);
    expect(isPersonalRunMcpEnabled({} as never, new URL("https://staging.serplists.com/api/mcp"))).toBe(false);
  });

  it("honors explicit enablement and disablement", () => {
    expect(isPersonalRunMcpEnabled(
      { PERSONAL_RUN_MCP_ENABLED: "true" } as never,
      new URL("https://staging.serplists.com/api/mcp"),
    )).toBe(true);
    expect(isPersonalRunMcpEnabled(
      { PERSONAL_RUN_MCP_ENABLED: "false" } as never,
      new URL("http://localhost/api/mcp"),
    )).toBe(false);
  });

  it("matches only the MCP and Agent Access API routes", () => {
    expect(isPersonalRunMcpPath("mcp")).toBe(true);
    expect(isPersonalRunMcpPath("agent-keys")).toBe(true);
    expect(isPersonalRunMcpPath("agent-keys/key-1")).toBe(true);
    expect(isPersonalRunMcpPath("agent-keys-anything")).toBe(false);
    expect(isPersonalRunMcpPath("templates")).toBe(false);
  });
});
