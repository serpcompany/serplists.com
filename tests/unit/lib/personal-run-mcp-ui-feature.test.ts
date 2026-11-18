import { afterEach, describe, expect, it, vi } from "vitest";

import { isPersonalRunMcpUiEnabled } from "@/env";

describe("Personal Run MCP UI feature gate", () => {
  it("defaults on locally and off remotely", () => {
    expect(isPersonalRunMcpUiEnabled("localhost")).toBe(true);
    expect(isPersonalRunMcpUiEnabled("127.0.0.1")).toBe(true);
    expect(isPersonalRunMcpUiEnabled("staging.serplists.com")).toBe(false);
    expect(isPersonalRunMcpUiEnabled("serplists.com")).toBe(false);
  });

  it("defaults on for IPv6 loopback, bare or with the brackets location.hostname and URL.hostname keep", () => {
    expect(isPersonalRunMcpUiEnabled(new URL("http://[::1]:5173/dashboard/settings").hostname)).toBe(true);
    expect(isPersonalRunMcpUiEnabled("::1")).toBe(true);
  });

  it("stays off while a page renders on the server, where there is no page address to read", () => {
    expect(isPersonalRunMcpUiEnabled()).toBe(false);
  });

  describe("with NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED set", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    const gateWith = async (value: string) => {
      vi.stubEnv("NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED", value);
      vi.resetModules();
      return (await import("@/env")).isPersonalRunMcpUiEnabled;
    };

    it("turns it on for every host when true", async () => {
      expect((await gateWith("true"))("serplists.com")).toBe(true);
    });

    it("turns it off on this machine too when false", async () => {
      expect((await gateWith("false"))("localhost")).toBe(false);
    });
  });
});
