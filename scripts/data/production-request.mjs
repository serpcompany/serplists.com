#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertMigrationClassification, validatePromotionEvidence } from "./production-executor-lib.mjs";
import { loadEnvironmentInventory } from "./environment-identity-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { resolveRehearsalPlan, validateCoverageMatch } from "./rehearsal-plan-lib.mjs";
import { normalizeMigrationRange, migrationsInRange, rangeFromPending, migrationRangeForReport } from "./migration-range-lib.mjs";
import { selectRangeEvidence } from "./select-range-evidence.mjs";
import { evaluateInvariantLedgerTransition } from "./remote-invariant-evidence-lib.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

try {
  const commit = arg("--commit");
  const from = arg("--migration-from");
  const to = arg("--migration-to");
  const output = arg("--output");
  const databaseName = arg("--database-name");
  const databaseId = arg("--database-id");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const production = loadEnvironmentInventory({ repoRoot }).environments.production;
  if (databaseName !== production.databaseName || databaseId !== production.databaseId) {
    throw new Error("Requested production database does not match the checked-in allowlist.");
  }
  const migrations = readdirSync(path.join(repoRoot, "db/migrations"))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrationRange = normalizeMigrationRange({ from: from ?? undefined, to: to ?? undefined });
  const pendingMigrations = migrationsInRange(migrations, migrationRange);
  rangeFromPending(migrations, pendingMigrations);
  const classification = arg("--classification");
  assertMigrationClassification({
    requested: classification,
    sqlTexts: pendingMigrations.map((name) => readFileSync(path.join(repoRoot, "db/migrations", name), "utf8")),
  });
  const ci = arg("--ci-directory") ? selectRangeEvidence(arg("--ci-directory"), migrationRange).report : JSON.parse(readFileSync(arg("--ci-report"), "utf8"));
  const ciContractCorrection = JSON.parse(readFileSync(arg("--correction-report"), "utf8"));
  const ciSchemaContract = JSON.parse(readFileSync(arg("--schema-report"), "utf8"));
  const rehearsal = JSON.parse(readFileSync(arg("--rehearsal-report"), "utf8"));
  const staging = JSON.parse(readFileSync(arg("--staging-report"), "utf8"));
  const ciRun = JSON.parse(readFileSync(arg("--ci-run-metadata"), "utf8"));
  const stagingRun = JSON.parse(readFileSync(arg("--staging-run-metadata"), "utf8"));
  const mergeCommit = JSON.parse(readFileSync(arg("--merge-commit"), "utf8"));
  const changeProvenance = JSON.parse(readFileSync(arg("--change-provenance"), "utf8"));
  const expectedPlan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom: migrationRange.from, migrationTo: migrationRange.to });
  validateCoverageMatch({ evidence: ci, expected: expectedPlan });
  validateCoverageMatch({ evidence: rehearsal, expected: expectedPlan });
  const stagingRange = normalizeMigrationRange(staging.migrationRange);
  const stagingPlan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom: stagingRange.from, migrationTo: stagingRange.to });
  validateCoverageMatch({ evidence: { ...staging.data, commit: staging.commit }, expected: { ...stagingPlan, commit: staging.commit } });
  const stagingTransition = evaluateInvariantLedgerTransition({ before: staging.invariants?.ledger?.before ?? [], after: staging.invariants?.ledger?.after ?? [], expectedRange: stagingRange, expectedMigrations: migrationsInRange(migrations, stagingRange), comparisonKind: "migration" });
  if (stagingTransition.verdict !== "pass") throw new Error("Staging evidence does not prove its ordered reviewed migration transition.");
  if (JSON.stringify(staging.invariants?.ledger?.after) !== JSON.stringify(migrations)) throw new Error("Staging post-migration ledger does not match the exact candidate repository history.");
  if (!output) throw new Error("Production request requires --output.");
  const evidence = validatePromotionEvidence({
    commit,
    classification,
    database: { databaseName, databaseId },
    migrationRange,
    pendingMigrations,
    ci,
    ciSchemaContract,
    ciContractCorrection,
    rehearsal,
    staging,
    ciRun,
    stagingRun,
    changeProvenance,
    mergeContext: { commit: mergeCommit.sha, tree: mergeCommit.commit?.tree?.sha, baseCommit: mergeCommit.parents?.[0]?.sha },
  });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  writeDataCheckReports({ name: "production-request", report: { check: "production-request", verdict: "pass", commit, target: { environment: "production", binding: "DB", databaseName, databaseId }, migrationRange, pendingMigrations, coverage: ci.coverage, stagingMigrationRange: stagingRange }, summary: `PASS production request commit=${commit} database=${databaseName} (${databaseId}) range=${migrationRange.from}->${migrationRange.to}; exact-commit CI, reviewed hashes and staging ledger verified. Production approval is still required.`, reportDirectory: path.join(path.dirname(output), "reports") });
  console.log(`Validated exact-commit production request for ${commit}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeDataCheckReports({
    name: "production-request",
    report: {
      check: "production-request",
      verdict: "fail",
      commit: arg("--commit") ?? "unknown",
      target: { environment: "production", databaseName: arg("--database-name") ?? "unknown", databaseId: arg("--database-id") ?? "unknown" },
      migrationRange: migrationRangeForReport({ from: arg("--migration-from") ?? undefined, to: arg("--migration-to") ?? undefined }),
      failedStage: "production-request-validation",
      error: message,
    },
    summary: `BLOCKED production request commit=${arg("--commit")} range=${arg("--migration-from")}->${arg("--migration-to")}: ${message}`,
    reportDirectory: "tmp/data-reports/production-request",
  });
  console.error(message);
  process.exitCode = 1;
}
