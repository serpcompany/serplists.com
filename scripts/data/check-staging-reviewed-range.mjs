#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportDirectory = "tmp/data-reports/staging";
const base = process.env.STAGING_BASE_SHA;
const head = process.env.GITHUB_SHA;
try {
  if (!/^[0-9a-f]{40}$/.test(base ?? "") || /^0{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head ?? "")) {
    throw new Error("Staging reviewed range requires exact nonzero GitHub push before/head SHAs.");
  }
  const gitEnvironment = sanitizedGitEnvironment();
  runRepositoryGit({ repoRoot, args: ["merge-base", "--is-ancestor", base, head], stdio: "ignore" });
  const changed = runRepositoryGit({ repoRoot, args: ["diff", "--name-only", base, head, "--", "db/migrations"] })
    .trim().split(/\r?\n/)
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
  ], { cwd: repoRoot, env: gitEnvironment, stdio: "inherit" });
  const output = execFileSync(pnpm, ["exec", "wrangler", "d1", "migrations", "list", "DB", "--remote", "--preview"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: gitEnvironment,
  });
  const pending = parsePendingMigrationNames(output);
  if (JSON.stringify(changed) !== JSON.stringify(pending)) {
    throw new Error(`Staging pending migrations ${pending.join(", ") || "none"} do not exactly match reviewed commit migrations ${changed.join(", ") || "none"}.`);
  }
  const report = {
    check: "staging-reviewed-range",
    verdict: "pass",
    commit: head,
    baseCommit: base,
    target: { environment: "staging", databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" },
    migrationRange: { from: pending[0] ?? null, to: pending.at(-1) ?? null },
    pendingMigrations: pending,
  };
  const summary = `PASS exact staging commit/range: ${pending.join(", ") || "no migration"}.`;
  writeDataCheckReports({ name: "staging-reviewed-range", report, summary, reportDirectory });
  console.log(summary);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeDataCheckReports({
    name: "staging-reviewed-range",
    report: { check: "staging-reviewed-range", verdict: "fail", commit: head ?? "unknown", baseCommit: base ?? "unknown", target: { environment: "staging", databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" }, migrationRange: { from: null, to: null }, error: message },
    summary: `BLOCKED staging reviewed range: ${message}`,
    reportDirectory,
  });
  console.error(message);
  process.exit(1);
}
