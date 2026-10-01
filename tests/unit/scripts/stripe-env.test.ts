import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseEnvFile, resolveTestSecretKey } from "../../../scripts/stripe/_env.mjs";
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

describe("Stripe scripts", () => {
  const scriptsDir = path.join(process.cwd(), "scripts", "stripe");
  const scripts = readdirSync(scriptsDir).filter((name) => name.endsWith(".mjs") && name !== "_env.mjs");

  it.each(["bootstrap.mjs", "configure-portal.mjs", "setup-local-test.mjs", "listen-local.mjs"])(
    "%s resolves the test key through resolveTestSecretKey",
    (name) => {
      expect(readFileSync(path.join(scriptsDir, name), "utf8")).toContain("resolveTestSecretKey(");
    },
  );

  it("read the dedicated test key names only through the shared resolver", () => {
    const direct = scripts.filter((name) =>
      /env\.(STRIPE_TEST_SECRET_KEY|STRIPE_SECRET_KEY_TEST)\b/.test(readFileSync(path.join(scriptsDir, name), "utf8")),
    );

    expect(direct).toEqual([]);
  });
});
