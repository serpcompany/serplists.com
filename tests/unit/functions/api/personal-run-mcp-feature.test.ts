import { describe, expect, it } from "vitest";
import { apiEnv } from "../../../support/apiEnv";

import {
  isPersonalRunMcpEnabled,
  isPersonalRunMcpPath,
} from "@functions/api/utils/personal-run-mcp-feature";

describe("personal run MCP feature gate", () => {
  it("defaults on locally and off remotely", () => {
    expect(isPersonalRunMcpEnabled(apiEnv(), new URL("http://localhost/api/mcp"))).toBe(true);
    expect(isPersonalRunMcpEnabled(apiEnv(), new URL("http://127.0.0.1:8788/api/mcp"))).toBe(true);
    expect(isPersonalRunMcpEnabled(apiEnv(), new URL("https://staging.serplists.com/api/mcp"))).toBe(false);
  });

  it("defaults on for IPv6 loopback, which URL serializes with brackets", () => {
    expect(new URL("http://[::1]:8788/api/mcp").hostname).toBe("[::1]");
    expect(isPersonalRunMcpEnabled(apiEnv(), new URL("http://[::1]:8788/api/mcp"))).toBe(true);
    expect(isPersonalRunMcpEnabled(apiEnv(), new URL("http://[0:0:0:0:0:0:0:1]/api/mcp"))).toBe(true);
    expect(isPersonalRunMcpEnabled(
      apiEnv({ PERSONAL_RUN_MCP_ENABLED: "false" }),
      new URL("http://[::1]:8788/api/mcp"),
    )).toBe(false);
    expect(isPersonalRunMcpEnabled(apiEnv(), new URL("http://localhost.evil.com/api/mcp"))).toBe(false);
    expect(isPersonalRunMcpEnabled(apiEnv(), new URL("http://127.0.0.1.nip.io/api/mcp"))).toBe(false);
  });

  it("honors explicit enablement and disablement", () => {
    expect(isPersonalRunMcpEnabled(
      apiEnv({ PERSONAL_RUN_MCP_ENABLED: "true" }),
      new URL("https://staging.serplists.com/api/mcp"),
    )).toBe(true);
    expect(isPersonalRunMcpEnabled(
      apiEnv({ PERSONAL_RUN_MCP_ENABLED: "false" }),
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
