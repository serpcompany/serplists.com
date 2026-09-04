#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { writeDataCheckReports } from "./reporting.mjs";
import {
  META_DIRECTORY,
  appendGeneratedProvenance,
  listMigrationFiles,
  loadProvenanceState,
  validateProvenanceState,
} from "./migration-provenance-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function git(args, fallback = "unknown") {
  try {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

const name = argument("--name");
const reportDirectory = argument("--report-dir") ?? process.env.DATA_REPORT_DIR ?? "tmp/data-reports";
const commit = git(["rev-parse", "HEAD"]);
let report;

try {
  if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error("--name is required and must be descriptive snake_case beginning with a letter.");
  }
  const dirtyMigrationPaths = git(["status", "--porcelain", "--", "db/migrations", "db/migration-provenance.json"], "")
    .split("\n")
    .filter(Boolean);
  if (dirtyMigrationPaths.length > 0) {
    throw new Error(`db/migrations must be unchanged before generation: ${dirtyMigrationPaths.join(", ")}`);
  }
  const beforeState = loadProvenanceState(repoRoot);
  const existingFailures = validateProvenanceState(beforeState);
  if (existingFailures.length > 0) {
    throw new Error(`Existing migration provenance is invalid: ${existingFailures.map((item) => item.detail).join("; ")}`);
  }

  const beforeMigrations = new Set(beforeState.files);
  const beforeSnapshots = new Set(beforeState.snapshots);
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
    "exec",
    "drizzle-kit",
    "generate",
    "--config",
    "db/drizzle.config.ts",
    "--name",
    name,
  ], { cwd: repoRoot, stdio: "inherit" });

  const addedMigrations = listMigrationFiles(repoRoot).filter((file) => !beforeMigrations.has(file));
  const addedSnapshots = readdirSync(path.join(repoRoot, META_DIRECTORY))
    .filter((file) => /^\d{4}_snapshot\.json$/.test(file) && !beforeSnapshots.has(file));

  if (addedMigrations.length === 0 && addedSnapshots.length === 0) {
    report = {
      check: "migration-generation",
      commit,
      target: { environment: "local", database: "repository-migration-history", databaseId: "git:db/migrations" },
      migrationRange: { from: beforeState.files[0] ?? null, to: beforeState.files.at(-1) ?? null },
      checks: [{ name: "unchanged-schema-no-migration", verdict: "pass" }],
      generated: null,
      verdict: "pass",
    };
  } else {
    if (addedMigrations.length !== 1 || addedSnapshots.length !== 1) {
      throw new Error(`Drizzle must generate exactly one SQL/snapshot pair; SQL=${addedMigrations.join(",")} snapshots=${addedSnapshots.join(",")}.`);
    }
    const expectedPrefix = String(beforeState.journal.entries.at(-1).idx + 1).padStart(4, "0");
    if (!addedMigrations[0].startsWith(`${expectedPrefix}_`) || addedSnapshots[0] !== `${expectedPrefix}_snapshot.json`) {
      throw new Error(`Generated pair did not use next sequence ${expectedPrefix}: ${addedMigrations[0]}, ${addedSnapshots[0]}.`);
    }
    appendGeneratedProvenance(repoRoot, { migrationFile: addedMigrations[0], snapshotFile: addedSnapshots[0] });
    const finalFailures = validateProvenanceState(loadProvenanceState(repoRoot));
    if (finalFailures.length > 0) throw new Error(finalFailures.map((item) => item.detail).join("; "));
    report = {
      check: "migration-generation",
      commit,
      target: { environment: "local", database: "repository-migration-history", databaseId: "git:db/migrations" },
      migrationRange: { from: beforeState.files[0] ?? null, to: addedMigrations[0] },
      checks: [
        { name: "drizzle-generated-sql", verdict: "pass" },
        { name: "snapshot-paired", verdict: "pass" },
        { name: "journal-paired", verdict: "pass" },
        { name: "manifest-locked", verdict: "pass" },
      ],
      generated: { migration: addedMigrations[0], snapshot: addedSnapshots[0] },
      verdict: "pass",
    };
  }
} catch (error) {
  report = {
    check: "migration-generation",
    commit,
    target: { environment: "local", database: "repository-migration-history", databaseId: "git:db/migrations" },
    migrationRange: { from: null, to: null },
    checks: [{ name: "safe-generation", verdict: "fail" }],
    error: error.message,
    verdict: "fail",
  };
}

const summary = report.verdict === "pass"
  ? report.generated
    ? `PASS generated ${report.generated.migration} with ${report.generated.snapshot}; commit=${commit}; environment=local.`
    : `PASS unchanged schema produced no migration; commit=${commit}; environment=local.`
  : `BLOCKED migration generation at ${commit}; environment=local: ${report.error}`;
const paths = writeDataCheckReports({ name: "migration-generation", report, summary, reportDirectory });
console.log(summary);
console.log(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}, ${paths.markdown}`);
if (report.verdict === "fail") process.exitCode = 1;
