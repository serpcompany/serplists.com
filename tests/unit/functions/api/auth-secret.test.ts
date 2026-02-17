import { describe, expect, it } from "vitest";
import { resolveAuthSecret } from "@functions/api/utils/auth-secret";

describe("resolveAuthSecret", () => {
  it("uses BETTER_AUTH_SECRET when present and valid", () => {
    const secret = resolveAuthSecret({
      BETTER_AUTH_SECRET: "better-auth-secret-with-32-characters!!",
      JWT_SECRET: "legacy-secret-with-32-characters!!!!!",
    });

    expect(secret).toBe("better-auth-secret-with-32-characters!!");
  });

  it("falls back to JWT_SECRET when BETTER_AUTH_SECRET is missing", () => {
    const secret = resolveAuthSecret({
      BETTER_AUTH_SECRET: undefined,
      JWT_SECRET: "legacy-secret-with-32-characters!!!!!",
    });

    expect(secret).toBe("legacy-secret-with-32-characters!!!!!");
  });

  it("throws when neither secret is 32+ chars", () => {
    expect(() =>
      resolveAuthSecret({
        BETTER_AUTH_SECRET: "short",
        JWT_SECRET: "also-short",
      })
    ).toThrow(/32\+ char BETTER_AUTH_SECRET/);
  });
});
