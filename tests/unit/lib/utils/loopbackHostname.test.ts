import { describe, expect, it } from "vitest";

import { isPersonalRunMcpUiEnabled } from "@/env";
import { isCanonicalLoopbackHostname, isLoopbackHostname } from "@/lib/utils/loopbackHostname";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { isPersonalRunMcpEnabled } from "@functions/api/utils/personal-run-mcp-feature";

import { apiEnv } from "../../../support/apiEnv";

const PAST_THE_HOST_CHECK_WITHOUT_A_RUN_KEY = 401;
const REFUSED_BY_THE_HOST_CHECK = 403;

const hostnameAsTheRouterAndBrowserSerializeIt = (url: string) => new URL(url).hostname;

type Host = { url: string; loopback: boolean; canonical: boolean };

const hosts: Host[] = [
  { url: "http://localhost:5173", loopback: true, canonical: true },
  { url: "http://LOCALHOST:8788", loopback: true, canonical: true },
  { url: "http://127.0.0.1:8788", loopback: true, canonical: true },
  { url: "http://[::1]:8788", loopback: true, canonical: true },
  { url: "http://[0:0:0:0:0:0:0:1]:8788", loopback: true, canonical: true },
  { url: "http://app.localhost:3000", loopback: true, canonical: false },
  { url: "http://127.8.9.10:8788", loopback: true, canonical: false },
  { url: "https://staging.serplists.com", loopback: false, canonical: false },
  { url: "https://serplists.com", loopback: false, canonical: false },
  { url: "https://serp-lists.pages.dev", loopback: false, canonical: false },
  { url: "http://localhost.evil.com", loopback: false, canonical: false },
  { url: "http://127.0.0.1.nip.io", loopback: false, canonical: false },
  { url: "http://128.0.0.1:8788", loopback: false, canonical: false },
  { url: "http://0.0.0.0:8788", loopback: false, canonical: false },
  { url: "http://[::]:8788", loopback: false, canonical: false },
  { url: "http://[::2]:8788", loopback: false, canonical: false },
];

async function mcpHostIsAccepted(url: string): Promise<boolean> {
  const requestWithoutARunKey = new Request(new URL("/api/mcp", url), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: "{}",
  });
  const response = await handleAgentMcp(requestWithoutARunKey, apiEnv());
  expect([PAST_THE_HOST_CHECK_WITHOUT_A_RUN_KEY, REFUSED_BY_THE_HOST_CHECK]).toContain(response.status);
  return response.status === PAST_THE_HOST_CHECK_WITHOUT_A_RUN_KEY;
}

describe("isLoopbackHostname, a host that resolves to this machine", () => {
  it.each(hosts)("$url is loopback: $loopback", ({ url, loopback }) => {
    expect(isLoopbackHostname(hostnameAsTheRouterAndBrowserSerializeIt(url))).toBe(loopback);
  });

  it("accepts ::1 with or without brackets and the fully qualified localhost, and refuses unbalanced brackets", () => {
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
    expect(isLoopbackHostname("LOCALHOST.")).toBe(true);
    expect(isLoopbackHostname("[::1")).toBe(false);
  });
});

describe("isCanonicalLoopbackHostname, which the Run Key and MCP gates keep", () => {
  it.each(hosts)("$url is canonical loopback: $canonical", ({ url, canonical }) => {
    expect(isCanonicalLoopbackHostname(hostnameAsTheRouterAndBrowserSerializeIt(url))).toBe(canonical);
  });

  it("accepts ::1 with or without brackets", () => {
    expect(isCanonicalLoopbackHostname("::1")).toBe(true);
    expect(isCanonicalLoopbackHostname("[::1")).toBe(false);
  });

  it("is what the API gate, the MCP host check and the UI flag allow when no flag is set, as in local development", async () => {
    for (const { url, canonical } of hosts) {
      expect(isPersonalRunMcpEnabled(apiEnv(), new URL("/api/mcp", url)), url).toBe(canonical);
      expect(isPersonalRunMcpUiEnabled(hostnameAsTheRouterAndBrowserSerializeIt(url)), url).toBe(canonical);
      expect(await mcpHostIsAccepted(url), url).toBe(canonical);
    }
  });
});
