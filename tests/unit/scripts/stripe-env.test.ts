import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseEnvFile, resolveLiveSecretKey, resolveTestSecretKey, stripeSecretKeyIsLive } from "../../../scripts/stripe/_env.mjs";
import { renderDevVars } from "../../../scripts/setup-local-lib.mjs";

describe("resolveTestSecretKey", () => {
  it("reads the test key from STRIPE_SECRET_KEY, as .dev.vars.example provides it", () => {
    expect(resolveTestSecretKey({ STRIPE_SECRET_KEY: "sk_test_single" })).toBe("sk_test_single");
  });

  it("prefers a dedicated test key, under either name", () => {
    expect(resolveTestSecretKey({ STRIPE_TEST_SECRET_KEY: "sk_test_b", STRIPE_SECRET_KEY: "sk_test_a" })).toBe(
      "sk_test_b",
    );
    expect(resolveTestSecretKey({ STRIPE_SECRET_KEY_TEST: "sk_test_c", STRIPE_SECRET_KEY: "sk_test_a" })).toBe(
      "sk_test_c",
    );
  });

  it("never resolves a live key, even one exported in the shell", () => {
    expect(resolveTestSecretKey({ STRIPE_SECRET_KEY: "sk_live_x" })).toBeUndefined();
    expect(resolveTestSecretKey({ STRIPE_TEST_SECRET_KEY: "sk_live_x" })).toBeUndefined();
  });

  it("fails rather than hide a wrong dedicated key behind STRIPE_SECRET_KEY", () => {
    expect(resolveTestSecretKey({ STRIPE_TEST_SECRET_KEY: "sk_live_x", STRIPE_SECRET_KEY: "sk_test_a" })).toBeUndefined();
  });

  it("treats an empty dedicated key as unset", () => {
    expect(resolveTestSecretKey({ STRIPE_TEST_SECRET_KEY: "", STRIPE_SECRET_KEY: "sk_test_a" })).toBe("sk_test_a");
    expect(resolveTestSecretKey({})).toBeUndefined();
  });

  it("resolves the key a developer fills in to the .dev.vars that setup writes", () => {
    const example = readFileSync(path.join(process.cwd(), ".dev.vars.example"), "utf8");
    const devVars = renderDevVars(example, "a".repeat(48)).replace(
      "# STRIPE_SECRET_KEY=sk_test_xxx",
      "STRIPE_SECRET_KEY=sk_test_abc",
    );
    const dir = mkdtempSync(path.join(tmpdir(), "stripe-env-"));
    try {
      writeFileSync(path.join(dir, ".dev.vars"), devVars);

      expect(resolveTestSecretKey(parseEnvFile(path.join(dir, ".dev.vars")))).toBe("sk_test_abc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveLiveSecretKey, the one place a script takes a live key from", () => {
  it("prefers a live key injected under its own name, under either spelling", () => {
    expect(resolveLiveSecretKey({ STRIPE_LIVE_SECRET_KEY: "sk_live_a", STRIPE_SECRET_KEY_LIVE: "sk_live_b" })).toBe("sk_live_a");
    expect(resolveLiveSecretKey({ STRIPE_SECRET_KEY_LIVE: "sk_live_b", STRIPE_SECRET_KEY: "sk_live_c" })).toBe("sk_live_b");
  });

  it("takes STRIPE_SECRET_KEY only when it holds a live key, so a test key never runs a live command", () => {
    expect(resolveLiveSecretKey({ STRIPE_SECRET_KEY: "sk_live_c" })).toBe("sk_live_c");
    expect(resolveLiveSecretKey({ STRIPE_SECRET_KEY: "sk_test_a" })).toBeUndefined();
    expect(resolveLiveSecretKey({})).toBeUndefined();
  });
});

describe("stripeSecretKeyIsLive, which tells scrub-local-live to remove the production-only values", () => {
  it("is true only for a live STRIPE_SECRET_KEY", () => {
    expect(stripeSecretKeyIsLive({ STRIPE_SECRET_KEY: "sk_live_c" })).toBe(true);
    expect(stripeSecretKeyIsLive({ STRIPE_SECRET_KEY: "sk_test_a" })).toBe(false);
    expect(stripeSecretKeyIsLive({ STRIPE_SECRET_KEY_LIVE: "sk_live_b" })).toBe(false);
    expect(stripeSecretKeyIsLive({})).toBe(false);
  });
});
