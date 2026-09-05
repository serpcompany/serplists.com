#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { normalizeMigrationRange, migrationRangesEqual, migrationRangeForReport } from "./migration-range-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { fullRecoveryStatesEqual } from "./recovery-restore-lib.mjs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

try {
  const comparison = JSON.parse(readFileSync(arg("--comparison"), "utf8"));
  const importEvidence = JSON.parse(readFileSync(arg("--import-evidence"), "utf8"));
  const teardown = readFileSync(arg("--teardown"), "utf8");
  const sourceDatabaseName = arg("--source-database-name");
  const recoveryDatabaseName = arg("--recovery-database-name");
  const rawPath = arg("--raw");
  const manifest = JSON.parse(readFileSync(arg("--sanitizer-manifest"), "utf8"));
  const sourceCreationBytes = readFileSync(arg("--source-creation"));
  const recoveryCreationBytes = readFileSync(arg("--recovery-creation"));
  const sourceCreation = JSON.parse(sourceCreationBytes);
  const recoveryCreation = JSON.parse(recoveryCreationBytes);
  const commit = arg("--commit");
  const environment = arg("--environment");
  const transformation = importEvidence.transformation;
  if (importEvidence.verdict !== "pass" || importEvidence.commit !== commit || importEvidence.target?.databaseId !== arg("--recovery-database-id") || importEvidence.target?.databaseName !== recoveryDatabaseName || importEvidence.target?.environment !== environment || importEvidence.preparedPlaintextCleanup !== "pass" || transformation?.format !== "d1-full-export-tables-first-v1" || !/^[a-f0-9]{64}$/.test(transformation.sourceSha256 ?? "") || !/^[a-f0-9]{64}$/.test(transformation.preparedSha256 ?? "")) throw new Error("Recovery import transformation and cleanup evidence is missing or unbound.");
  if (comparison.fullRecovery?.verdict !== "pass" || !fullRecoveryStatesEqual(comparison.fullRecovery.before, comparison.fullRecovery.after)) throw new Error("Complete recovery catalog and data equality was not proven.");
  const { from: migrationFrom, to: migrationTo } = normalizeMigrationRange({ from: arg("--migration-from") ?? undefined, to: arg("--migration-to") ?? undefined });
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const plan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom, migrationTo });
  validateSanitizedRehearsalArtifact({ sql: readFileSync(arg("--sanitized"), "utf8"), manifest, policy: loadSanitizerPolicy({ repoRoot }), now: new Date(), migrationRange: plan.migrationRange, sourceSchema: plan.preMigration });
  const expectedLedger = readdirSync(new URL("../../db/migrations/", import.meta.url)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (JSON.stringify(comparison.ledger?.before) !== JSON.stringify(expectedLedger) || JSON.stringify(comparison.ledger?.after) !== JSON.stringify(expectedLedger)) throw new Error("Recovery must preserve the complete ordered candidate ledger.");
  const absencePass = [sourceDatabaseName, recoveryDatabaseName].every((name) =>
    teardown.includes(`PASS rehearsal ${name} is absent.`),
  );
  const comparisonBound = comparison.verdict === "pass" && comparison.check === "remote-invariant-comparison" && comparison.comparisonKind === "recovery" && comparison.commit === commit && comparison.target?.environment === environment && comparison.target?.binding === "DB" && comparison.target?.databaseName === recoveryDatabaseName && comparison.target?.databaseId === arg("--recovery-database-id") && comparison.sourceTarget?.databaseName === sourceDatabaseName && comparison.sourceTarget?.databaseId === arg("--source-database-id") && migrationRangesEqual(comparison.migrationRange, { from: migrationFrom, to: migrationTo }) && comparison.ledger?.verdict === "pass" && comparison.preDomainDigest && comparison.preDomainDigest === comparison.postDomainDigest;
  const sanitizerBound = manifest.provenance?.gitCommit === commit && manifest.sanitizerVersion && manifest.artifact?.sha256;
  const creationBound = sourceCreation.verdict === "pass" && recoveryCreation.verdict === "pass" && sourceCreation.commit === commit && recoveryCreation.commit === commit && sourceCreation.runId === recoveryCreation.runId && sourceCreation.target?.databaseName === sourceDatabaseName && sourceCreation.target?.databaseId === arg("--source-database-id") && recoveryCreation.target?.databaseName === recoveryDatabaseName && recoveryCreation.target?.databaseId === arg("--recovery-database-id");
  if (!comparisonBound || !sanitizerBound || !creationBound || !absencePass || existsSync(rawPath)) {
    throw new Error("Recovery restore, invariant comparison, absence, or plaintext cleanup was not proven.");
  }
  const evidence = {
    verdict: "pass",
    commit,
    environment,
    sourceDatabase: { name: sourceDatabaseName, id: arg("--source-database-id") },
    recoveryDatabase: { name: recoveryDatabaseName, id: arg("--recovery-database-id") },
    migration: { from: migrationFrom, to: migrationTo, appliedThrough: comparison.ledger.appliedThrough, ledgerSha256: comparison.ledger.afterSha256 },
    sanitizer: { version: manifest.sanitizerVersion, artifactSha256: manifest.artifact.sha256, sourceProfile: manifest.sourceProfile, manifestIntegritySha256: manifest.manifestIntegritySha256 },
    creation: { verdict: "pass", runId: sourceCreation.runId, sourceEvidenceSha256: createHash("sha256").update(sourceCreationBytes).digest("hex"), recoveryEvidenceSha256: createHash("sha256").update(recoveryCreationBytes).digest("hex") },
    import: { verdict: "pass", target: recoveryDatabaseName, transformation, preparedPlaintextCleanup: "pass", evidenceSha256: createHash("sha256").update(readFileSync(arg("--import-evidence"))).digest("hex") },
    fullRecovery: comparison.fullRecovery,
    invariants: { verdict: "pass", comparison: arg("--comparison"), evidenceSha256: createHash("sha256").update(readFileSync(arg("--comparison"))).digest("hex"), domainDigest: comparison.postDomainDigest },
    absence: { verdict: "pass", evidence: arg("--teardown") },
    rawPlaintextRetained: false,
  };
  writeFileSync(arg("--output"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  writeDataCheckReports({ name: "recovery-rehearsal", report: { check: "recovery-rehearsal", ...evidence, target: { environment, binding: "DB", databaseName: recoveryDatabaseName, databaseId: arg("--recovery-database-id") }, migrationRange: evidence.migration, sanitizerVersion: evidence.sanitizer.version }, summary: `PASS recovery rehearsal commit=${commit} environment=${environment} binding=DB database=${recoveryDatabaseName} databaseId=${arg("--recovery-database-id")} migration=${migrationFrom}->${migrationTo} sanitizer=${evidence.sanitizer.version}.`, reportDirectory: path.dirname(arg("--output")) });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const output = arg("--output") ?? "tmp/data-reports/rehearsal/recovery-rehearsal.json";
  const failure = { check: "recovery-rehearsal", verdict: "fail", commit: arg("--commit") ?? "unknown", target: { environment: arg("--environment") ?? "unknown", binding: "DB", databaseName: arg("--recovery-database-name") ?? "unknown", databaseId: arg("--recovery-database-id") ?? "unknown" }, sourceDatabase: { name: arg("--source-database-name"), id: arg("--source-database-id") }, migrationRange: migrationRangeForReport({ from: arg("--migration-from") ?? undefined, to: arg("--migration-to") ?? undefined }), sanitizerVersion: "unknown", error: message };
  writeDataCheckReports({ name: "recovery-rehearsal", report: failure, summary: `BLOCKED recovery rehearsal commit=${failure.commit} environment=${failure.target.environment} binding=DB database=${failure.target.databaseName} databaseId=${failure.target.databaseId} migration=${failure.migrationRange.from}->${failure.migrationRange.to}: ${message}`, reportDirectory: path.dirname(output) });
  console.error(message);
  process.exitCode = 1;
}
