#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";
import { validateRehearsalRecoveryEvidence } from "./rehearsal-recovery-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
try {
  const source = JSON.parse(readFileSync(arg("--source"), "utf8"));
  const required = [arg("--comparison"), arg("--recovery"), arg("--teardown")];
  if (source.verdict !== "pass" || source.commit !== arg("--commit") || source.target?.environment !== "local" || required.some((file) => !file || !existsSync(file))) throw new Error("Exact-commit local prerequisite evidence is incomplete, mislabeled, or failed.");
  const output = arg("--output");
  const invariants = JSON.parse(readFileSync(arg("--comparison"), "utf8"));
  const sanitizedManifest = JSON.parse(readFileSync(arg("--sanitizer-manifest"), "utf8"));
  const recovery = validateRehearsalRecoveryEvidence({
    evidence: JSON.parse(readFileSync(arg("--recovery"), "utf8")),
    sourceDatabaseId: arg("--database-id"),
    recoveryDatabaseId: arg("--recovery-database-id"),
    expectedCommit: arg("--commit"),
    expectedEnvironment: "rehearsal",
    expectedMigrationFrom: arg("--migration-from"),
    expectedMigrationTo: arg("--migration-to"),
    expectedSanitizerVersion: sanitizedManifest?.sanitizerVersion,
  });
  const recoveryPass = recovery.verdict === "pass";
  validateSanitizedRehearsalArtifact({
    sql: readFileSync(arg("--sanitized"), "utf8"),
    manifest: sanitizedManifest,
    policy: loadSanitizerPolicy({ repoRoot: path.resolve(new URL("../..", import.meta.url).pathname) }),
    now: new Date(),
  });
  const teardownPass = /PASS rehearsal .* is absent/.test(readFileSync(arg("--teardown"), "utf8"));
  const remoteTarget = { environment: "rehearsal", binding: "DB", databaseName: arg("--database-name"), databaseId: arg("--database-id") };
  const remoteBound = invariants.verdict === "pass" && invariants.commit === arg("--commit") && invariants.comparisonKind === "migration" && JSON.stringify(invariants.target) === JSON.stringify(remoteTarget) && invariants.migrationRange?.from === arg("--migration-from") && invariants.migrationRange?.to === arg("--migration-to") && invariants.ledger?.verdict === "pass";
  if (!remoteBound || !recoveryPass || !teardownPass) throw new Error("Remote rehearsal identity, migration ledger, invariants, recovery, or confirmed teardown failed.");
  const report = {
    check: "production-shaped-rehearsal",
    verdict: "pass",
    commit: arg("--commit"),
    target: remoteTarget,
    migrationRange: arg("--migration-from") === "none"
      ? { from: null, to: null }
      : { from: arg("--migration-from"), to: arg("--migration-to") },
    localPrerequisite: source,
    remoteRehearsal: { target: remoteTarget, migrationRange: invariants.migrationRange, invariants },
    recovery,
    sanitizedSource: {
      verdict: "pass",
      attestation: { verdict: "pass", verifier: "github-cli-before-import" },
      sanitizerVersion: sanitizedManifest.sanitizerVersion,
      artifactSha256: sanitizedManifest.artifact.sha256,
      manifestIntegritySha256: sanitizedManifest.manifestIntegritySha256,
      sourceDate: sanitizedManifest.provenance.sourceDate,
      accessOwner: sanitizedManifest.handling.accessOwner,
      retentionDeadline: sanitizedManifest.handling.retentionDeadline,
      sourceCounts: sanitizedManifest.selection.sourceCounts,
      selectedCounts: sanitizedManifest.selection.selectedCounts,
      coveredShapes: sanitizedManifest.selection.coveredShapes,
    },
    teardown: { verdict: teardownPass ? "pass" : "fail", environment: "rehearsal", sourceDatabaseId: arg("--database-id"), recoveryDatabaseId: arg("--recovery-database-id"), remoteEvidence: arg("--teardown") },
  };
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(output.replace(/\.json$/, ".md"), `# Production-shaped rehearsal: PASS\n\nCommit: ${report.commit}\nEnvironment: rehearsal\nDatabase: ${report.target.databaseName} (${report.target.databaseId})\nRecovery database: ${recovery.recoveryDatabase.name} (${recovery.recoveryDatabase.id})\nMigration: ${report.migrationRange.from} -> ${report.migrationRange.to}\nSanitizer: ${sanitizedManifest.sanitizerVersion}\nSource date: ${sanitizedManifest.provenance.sourceDate}\nAccess owner: ${sanitizedManifest.handling.accessOwner}\nRetention deadline: ${sanitizedManifest.handling.retentionDeadline}\nRequired edge-case coverage: PASS\nRecovery, raw-source cleanup, database teardown: PASS\n`);
  const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  writeFileSync(output.replace(/\.json$/, ".junit.xml"), `<testsuite name="production-shaped-rehearsal" tests="1" failures="0"><properties><property name="commit" value="${xml(report.commit)}"/><property name="environment" value="rehearsal"/><property name="database" value="${xml(report.target.databaseName)}"/><property name="databaseId" value="${xml(report.target.databaseId)}"/><property name="recoveryDatabaseId" value="${xml(recovery.recoveryDatabase.id)}"/><property name="migration" value="${xml(`${report.migrationRange.from}->${report.migrationRange.to}`)}"/><property name="sanitizer" value="${xml(sanitizedManifest.sanitizerVersion)}"/></properties><testcase name="rehearsal-and-separate-database-restore"/></testsuite>\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const output = arg("--output") ?? "tmp/data-reports/rehearsal/data-regression-suite.json";
  let sanitizerVersion = "unknown";
  try { sanitizerVersion = JSON.parse(readFileSync(arg("--sanitizer-manifest"), "utf8")).sanitizerVersion ?? "unknown"; } catch {}
  const failure = { check: "production-shaped-rehearsal", verdict: "fail", commit: arg("--commit") ?? "unknown", target: { environment: "rehearsal", databaseName: arg("--database-name"), databaseId: arg("--database-id") }, migrationRange: { from: arg("--migration-from"), to: arg("--migration-to") }, sanitizerVersion, error: message };
  const identity = `commit=${failure.commit} environment=rehearsal database=${failure.target.databaseName} databaseId=${failure.target.databaseId} migration=${failure.migrationRange.from}->${failure.migrationRange.to} sanitizer=${failure.sanitizerVersion}`;
  writeDataCheckReports({ name: "data-regression-suite", report: failure, summary: `BLOCKED production-shaped rehearsal: ${identity}: ${message}`, reportDirectory: path.dirname(output) });
  console.error(message);
  process.exitCode = 1;
}
