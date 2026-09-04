#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { sanitizedGitEnvironment } from "./migration-provenance-lib.mjs";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
try {
  const base = process.env.STAGING_BASE_SHA;
  const head = process.env.GITHUB_SHA;
  if (!/^[0-9a-f]{40}$/.test(base ?? "") || /^0{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head ?? "")) {
    throw new Error("Staging reviewed range requires exact nonzero GitHub push before/head SHAs.");
  }
  const gitEnvironment = sanitizedGitEnvironment();
  execFileSync("git", ["merge-base", "--is-ancestor", base, head], { env: gitEnvironment, stdio: "ignore" });
  const changed = execFileSync("git", ["diff", "--name-only", base, head, "--", "db/migrations"], {
    encoding: "utf8",
    env: gitEnvironment,
  }).trim().split(/\r?\n/)
    .filter((name) => /^db\/migrations\/\d{4}_[a-z][a-z0-9_]*\.sql$/.test(name))
    .map((name) => name.split("/").at(-1))
    .sort();
  execFileSync(pnpm, [
    "run",
    "check:data:migration-provenance",
    "--",
    "--base",
    base,
    "--report-dir",
    process.env.DATA_REPORT_DIR ?? "tmp/data-reports/staging-reviewed-range",
  ], { env: gitEnvironment, stdio: "inherit" });
  const output = execFileSync(pnpm, ["exec", "wrangler", "d1", "migrations", "list", "DB", "--remote", "--preview"], {
    encoding: "utf8",
    env: gitEnvironment,
  });
  const pending = parsePendingMigrationNames(output);
  if (JSON.stringify(changed) !== JSON.stringify(pending)) {
    throw new Error(`Staging pending migrations ${pending.join(", ") || "none"} do not exactly match reviewed commit migrations ${changed.join(", ") || "none"}.`);
  }
  console.log(`PASS exact staging commit/range: ${pending.join(", ") || "no migration"}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
