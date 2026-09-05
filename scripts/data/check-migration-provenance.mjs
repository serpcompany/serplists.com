#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeDataCheckReports } from "./reporting.mjs";
import { reportIdentitySummary } from "./report-identity-lib.mjs";
import {
  allPassingChecks,
  loadProvenanceState,
  sanitizedGitEnvironment,
  validateAgainstBase,
  validateProvenanceState,
  verifyNewMigrationGeneratedFromBase,
  verifySchemaMatchesLatestSnapshot,
} from "./migration-provenance-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function git(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: sanitizedGitEnvironment(),
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return fallback;
  }
}

function defaultBase() {
  const configured = process.env.MIGRATION_PROVENANCE_BASE_SHA || process.env.SCHEMA_CONTRACT_BASE_SHA;
  if (configured) return configured;
  return git(["merge-base", "origin/staging", "HEAD"], null);
}

const commit = git(["rev-parse", "HEAD"]);
const baseRef = argument("--base") ?? defaultBase();
const reportDirectory = argument("--report-dir") ?? process.env.DATA_REPORT_DIR ?? "tmp/data-reports";

let state;
let failures = [];
try {
  state = loadProvenanceState(repoRoot);
  failures = [
    ...validateProvenanceState(state),
    ...validateAgainstBase(state, baseRef),
    ...verifyNewMigrationGeneratedFromBase(state, baseRef),
    ...verifySchemaMatchesLatestSnapshot(repoRoot),
  ];
} catch (error) {
  failures = [{ name: "provenance-check-error", detail: error.message, verdict: "fail" }];
}

const checks = allPassingChecks(failures);
for (const item of failures) {
  if (!checks.some((check) => check.name === item.name)) checks.push({ name: item.name, verdict: "fail" });
}
const migrationFiles = state?.files ?? [];
const report = {
  check: "migration-provenance",
  commit,
  baseRef,
  target: {
    environment: "local",
    binding: "not-applicable:repository-history",
    databaseName: "repository-migration-history",
    databaseId: "git:db/migrations",
  },
  migrationRange: {
    from: state ? migrationFiles[0] ?? null : "unknown",
    to: state ? migrationFiles.at(-1) ?? null : "unknown",
  },
  checks,
  failures,
  verdict: failures.length === 0 ? "pass" : "fail",
};
const summary = report.verdict === "pass"
  ? `PASS repository migration provenance; ${reportIdentitySummary(report)}; ${migrationFiles.length} locked Wrangler migrations.`
  : [
      `BLOCKED repository migration provenance; ${reportIdentitySummary(report)}; base=${baseRef ?? "none"}.`,
      ...failures.map((item) => `- ${item.name}: ${item.detail}`),
      "Use pnpm db:generate -- --name <snake_case_name>; do not add or edit numbered SQL by hand.",
    ].join("\n");

const paths = writeDataCheckReports({ name: "migration-provenance", report, summary, reportDirectory });
console.log(summary);
console.log(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}, ${paths.markdown}`);
if (report.verdict === "fail") process.exitCode = 1;
