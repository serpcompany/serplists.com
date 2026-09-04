import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../", import.meta.url);
const scripts = JSON.parse(readFileSync(new URL("package.json", repositoryRoot), "utf8")).scripts;

describe("local production mutation guard", () => {
  it.each([
    "db:migrations:baseline:prod",
    "db:migrate:d1:prod",
    "db:cleanup:remote",
    "db:seed:official:remote",
    "auth:reset:official:serp",
    "billing:set:official:serp",
    "db:migrate",
  ])("routes %s to the blocking guard instead of Wrangler", (name) => {
    expect(scripts[name]).toContain("production-path-blocked.mjs");
    expect(scripts[name]).not.toContain("wrangler");
  });

  it.each([
    "db:migrations:baseline:staging",
    "db:migrate:d1:staging",
    "db:seed:official:staging",
  ])("routes %s through the guarded remote CLI instead of direct Wrangler", (name) => {
    expect(scripts[name]).toContain("remote-path-blocked.mjs");
    expect(scripts[name]).not.toContain("wrangler");
  });

  it("refuses the legacy baseline helper for every remote database before invoking Wrangler", () => {
    expect(() => execFileSync(process.execPath, [
      "scripts/d1-baseline-migrations.mjs", "--remote", "--database", "serp-checklists-staging-db",
      "--through", "0023_add_sitemap_revision_state.sql", "--execute",
    ], { cwd: new URL("../../", import.meta.url), encoding: "utf8", stdio: "pipe" })).toThrow(/remote baseline/i);
  });

  it.each([
    "scripts/reset-official-serp-password.mjs",
    "scripts/set-official-serp-plan.mjs",
  ])("blocks direct legacy executable %s before any remote command can start", (script) => {
    const fixture = mkdtempSync(join(tmpdir(), "serplists-blocked-production-path-"));
    try {
      const marker = join(fixture, "remote-command-started");
      const fakeNpx = join(fixture, process.platform === "win32" ? "npx.cmd" : "npx");
      writeFileSync(
        fakeNpx,
        process.platform === "win32"
          ? `@echo started>${marker}\r\n@exit /b 97\r\n`
          : `#!/bin/sh\nprintf started > '${marker}'\nexit 97\n`,
      );
      chmodSync(fakeNpx, 0o755);

      expect(() => execFileSync(process.execPath, [script, "--json"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          D1_DATABASE_NAME: "attacker-selected-production-database",
          PATH: `${fixture}${delimiter}${process.env.PATH ?? ""}`,
        },
        stdio: "pipe",
      })).toThrow(/direct production database access is disabled/i);
      expect(existsSync(marker)).toBe(false);
      expect(readFileSync(new URL(script, repositoryRoot), "utf8")).not.toContain("D1_DATABASE_NAME");
      expect(readFileSync(new URL(script, repositoryRoot), "utf8")).not.toContain("wrangler");
    } finally {
      rmSync(fixture, { force: true, recursive: true });
    }
  });

  it.each([
    ["auth:reset:official:serp", "scripts/reset-official-serp-password.mjs", "docs/knowledge/official-serp-live-password-reset-script-2026-04-02.md"],
    ["billing:set:official:serp", "scripts/set-official-serp-plan.mjs", "docs/knowledge/official-serp-pro-override-script-2026-04-02.md"],
  ])("keeps the blocked %s package, executable, and documentation paths consistent", (packageScript, executable, documentation) => {
    expect(scripts[packageScript]).toBe("node scripts/data/production-path-blocked.mjs");
    expect(readFileSync(new URL(executable, repositoryRoot), "utf8").trim()).toBe('import "./data/production-path-blocked.mjs";');
    const document = readFileSync(new URL(documentation, repositoryRoot), "utf8");
    expect(document).toContain("legacy executable is now blocked for both reads and");
    expect(document).toContain("There is no\n> supported local production-read shortcut.");
  });
});
