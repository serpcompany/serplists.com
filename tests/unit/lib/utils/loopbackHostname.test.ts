import { describe, expect, it } from "vitest";

import { isPersonalRunMcpUiEnabled } from "@/env";
import { isLoopbackHostname } from "@/lib/utils/loopbackHostname";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { isPersonalRunMcpEnabled } from "@functions/api/utils/personal-run-mcp-feature";

const PAST_THE_HOST_CHECK_WITHOUT_A_RUN_KEY = 401;
const REFUSED_BY_THE_HOST_CHECK = 403;

const hostnameAsTheRouterAndBrowserSerializeIt = (url: string) => new URL(url).hostname;

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
  const requestWithoutARunKey = new Request(new URL("/api/mcp", url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: "{}",
  });
  const response = await handleAgentMcp(requestWithoutARunKey, { DB: {} } as never);
  expect([PAST_THE_HOST_CHECK_WITHOUT_A_RUN_KEY, REFUSED_BY_THE_HOST_CHECK]).toContain(response.status);
  return response.status === PAST_THE_HOST_CHECK_WITHOUT_A_RUN_KEY;
}

describe("isLoopbackHostname", () => {
  it.each(hosts)("%s is loopback: %s", (url, loopback) => {
    expect(isLoopbackHostname(hostnameAsTheRouterAndBrowserSerializeIt(url))).toBe(loopback);
  });

  it("accepts the bare IPv6 form callers may pass", () => {
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1")).toBe(false);
  });

  it("agrees with the API gate, the MCP host check, and the UI flag when no flag is set, as in local development", async () => {
    const envWithNoFlags = {} as never;
    for (const [url, loopback] of hosts) {
      expect(isPersonalRunMcpEnabled(envWithNoFlags, new URL("/api/mcp", url)), url).toBe(loopback);
      expect(isPersonalRunMcpUiEnabled(hostnameAsTheRouterAndBrowserSerializeIt(url)), url).toBe(loopback);
      expect(await mcpHostIsAccepted(url), url).toBe(loopback);
    }
  });
});
