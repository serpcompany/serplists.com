import { describe, expect, it } from "vitest";

import { getLoginReturnPath } from "@/lib/auth/loginReturnPath";
import { buildConsoleSettingsPath } from "@/lib/routes";

const fromState = (from: unknown) => ({ from });

describe("getLoginReturnPath", () => {
  it("keeps the query and hash RequireAuth saved, so a Stripe return survives sign-in", () => {
    expect(
      getLoginReturnPath(
        fromState({
          pathname: "/dashboard/settings",
          search: "?billing=success",
          hash: "#x",
        }),
      ),
    ).toBe("/dashboard/settings?billing=success#x");
  });

  it("accepts a full router location, as TemplateDetail passes it", () => {
    expect(
      getLoginReturnPath(
        fromState({
          pathname: "/templates/abc",
          search: "",
          hash: "",
          state: null,
          key: "default",
        }),
      ),
    ).toBe("/templates/abc");
  });

  it("adds the missing ? and # separators", () => {
    expect(
      getLoginReturnPath(fromState({ pathname: "/dashboard/settings", search: "billing=cancel", hash: "top" })),
    ).toBe("/dashboard/settings?billing=cancel#top");
  });

  it("falls back to settings when no return location was saved", () => {
    expect(getLoginReturnPath(undefined)).toBe(buildConsoleSettingsPath());
    expect(getLoginReturnPath(null)).toBe(buildConsoleSettingsPath());
    expect(getLoginReturnPath({})).toBe(buildConsoleSettingsPath());
    expect(getLoginReturnPath(fromState({ search: "?billing=success" }))).toBe(buildConsoleSettingsPath());
    expect(getLoginReturnPath(fromState({ pathname: "" }))).toBe(buildConsoleSettingsPath());
    expect(getLoginReturnPath(fromState({ pathname: 42 }))).toBe(buildConsoleSettingsPath());
  });

  it("rejects anything that is not a same-origin relative path", () => {
    for (const pathname of [
      "//evil.com",
      "//evil.com/dashboard",
      "/\\evil.com",
      "/\t/evil.com",
      "https://evil.com/dashboard",
      "javascript:alert(1)",
      "dashboard/settings",
    ]) {
      expect(getLoginReturnPath(fromState({ pathname })), pathname).toBe(buildConsoleSettingsPath());
    }
  });
});
