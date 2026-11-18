import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadLocalEnv, removeEnvKeys, updateEnvFile } from "../../../scripts/stripe/_env";

let dir = "";
const startedIn = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "stripe-env-files-"));
});

afterEach(() => {
  process.chdir(startedIn);
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

const fileIn = (name: string) => path.join(dir, name);

describe("loadLocalEnv, which the Stripe scripts read their settings from", () => {
  it("lets .env.local override .env, .dev.vars override both, and the shell override every file", () => {
    writeFileSync(fileIn(".env"), "FROM=env\nONLY_ENV=1\nSHELL_WINS=env\n");
    writeFileSync(fileIn(".env.local"), "FROM=env.local\nONLY_LOCAL=1\n");
    writeFileSync(fileIn(".dev.vars"), "FROM=dev.vars\nSHELL_WINS=dev.vars\n");
    vi.stubEnv("SHELL_WINS", "shell");
    process.chdir(dir);

    expect(loadLocalEnv()).toMatchObject({
      FROM: "dev.vars",
      ONLY_ENV: "1",
      ONLY_LOCAL: "1",
      SHELL_WINS: "shell",
    });
  });

  it("reads only the shell when the checkout has none of the files", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_from_shell");
    process.chdir(dir);

    const env = loadLocalEnv();

    expect(env["STRIPE_SECRET_KEY"]).toBe("sk_test_from_shell");
    expect(env["FROM"]).toBeUndefined();
  });
});

describe("updateEnvFile, which saves the ids and secrets a Stripe script resolved", () => {
  it("replaces a value in place, keeps every other line, and adds new names at the end", () => {
    writeFileSync(fileIn(".dev.vars"), "# local only\nSTRIPE_SECRET_KEY=sk_test_old\nOTHER=kept\n\n");

    updateEnvFile(fileIn(".dev.vars"), { STRIPE_SECRET_KEY: "sk_test_new", STRIPE_PRO_PRICE_ID: "price_123" });

    expect(readFileSync(fileIn(".dev.vars"), "utf8")).toBe(
      "# local only\nSTRIPE_SECRET_KEY=sk_test_new\nOTHER=kept\n\nSTRIPE_PRO_PRICE_ID=price_123\n",
    );
  });

  it("creates the file when it is missing", () => {
    updateEnvFile(fileIn(".dev.vars"), { STRIPE_WEBHOOK_SECRET: "whsec_abc" });

    expect(readFileSync(fileIn(".dev.vars"), "utf8")).toBe("STRIPE_WEBHOOK_SECRET=whsec_abc\n");
  });

  it("ends a file that had no final newline with one", () => {
    writeFileSync(fileIn(".dev.vars"), "A=1");

    updateEnvFile(fileIn(".dev.vars"), { A: "2" });

    expect(readFileSync(fileIn(".dev.vars"), "utf8")).toBe("A=2\n");
  });
});

describe("removeEnvKeys, which scrubs production-only names from .dev.vars", () => {
  it("drops the named variables and keeps comments and every other variable", () => {
    writeFileSync(fileIn(".dev.vars"), "# Stripe\nSTRIPE_SECRET_KEY=sk_live_x\nBETTER_AUTH_SECRET=kept\nSTRIPE_ACCOUNT_ID=acct_1\n");

    removeEnvKeys(fileIn(".dev.vars"), ["STRIPE_SECRET_KEY", "STRIPE_ACCOUNT_ID", "NOT_PRESENT"]);

    expect(readFileSync(fileIn(".dev.vars"), "utf8")).toBe("# Stripe\nBETTER_AUTH_SECRET=kept\n");
  });

  it("leaves a missing file missing", () => {
    removeEnvKeys(fileIn(".dev.vars"), ["STRIPE_SECRET_KEY"]);

    expect(existsSync(fileIn(".dev.vars"))).toBe(false);
  });
});
