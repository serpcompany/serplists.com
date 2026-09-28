import { describe, expect, it } from "vitest";

import { isPersonalRunMcpUiEnabled } from "@/env";
import { isLoopbackHostname } from "@/lib/utils/loopbackHostname";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { isPersonalRunMcpEnabled } from "@functions/api/utils/personal-run-mcp-feature";

// Hostnames come from new URL(...).hostname, the same serialization the router
// (request.url) and the browser (location.hostname) use: IPv6 keeps its brackets.
const hosts: Array<[url: string, loopback: boolean]> = [
  ["http://localhost:5173", true],
  ["http://LOCALHOST:8788", true],
  ["http://127.0.0.1:8788", true],
  ["http://[::1]:8788", true],
  ["http://[0:0:0:0:0:0:0:1]:8788", true],
  ["https://staging.serplists.com", false],
  ["https://serplists.com", false],
  ["https://serp-lists.pages.dev", false],
  ["http://localhost.evil.com", false],
  ["http://127.0.0.1.nip.io", false],
  ["http://0.0.0.0:8788", false],
  ["http://[::2]:8788", false],
];

async function mcpHostIsAccepted(url: string): Promise<boolean> {
  // No Run Key: a request past the host check fails authentication (401), while a
  // request the host check refuses gets 403 first.
  const response = await handleAgentMcp(new Request(new URL("/api/mcp", url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: "{}",
  }), { DB: {} } as never);
  expect([401, 403]).toContain(response.status);
  return response.status === 401;
}

describe("isLoopbackHostname", () => {
  it.each(hosts)("%s is loopback: %s", (url, loopback) => {
    expect(isLoopbackHostname(new URL(url).hostname)).toBe(loopback);
  });

  it("accepts the bare IPv6 form callers may pass", () => {
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1")).toBe(false);
  });

  // With no explicit flags (as in local development), all three follow the loopback rule.
  it("agrees with the API gate, the MCP host check, and the UI flag", async () => {
    for (const [url, loopback] of hosts) {
      expect(isPersonalRunMcpEnabled({} as never, new URL("/api/mcp", url)), url).toBe(loopback);
      expect(isPersonalRunMcpUiEnabled(new URL(url).hostname), url).toBe(loopback);
      expect(await mcpHostIsAccepted(url), url).toBe(loopback);
    }
  });
});
