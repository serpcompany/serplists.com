#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";
import { validateRehearsalRecoveryEvidence } from "./rehearsal-recovery-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { resolveRehearsalPlan, validateCoverageMatch } from "./rehearsal-plan-lib.mjs";
import { validateAuthenticatedCandidateEvidence } from "./authenticated-coverage-lib.mjs";
import { validateSanitizedStateBinding } from "./sanitized-state-lib.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
try {
  const source = JSON.parse(readFileSync(arg("--source"), "utf8"));
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const expectedPlan = resolveRehearsalPlan({ repoRoot, commit: arg("--commit"), migrationFrom: arg("--migration-from"), migrationTo: arg("--migration-to") });
  validateCoverageMatch({ evidence: source, expected: expectedPlan });
  const required = [arg("--comparison"), arg("--recovery"), arg("--teardown")];
  if (source.verdict !== "pass" || source.commit !== arg("--commit") || source.target?.environment !== "local" || source.migrationRange?.from !== (arg("--migration-from") === "none" ? null : arg("--migration-from")) || source.migrationRange?.to !== (arg("--migration-to") === "none" ? null : arg("--migration-to")) || source.coverage?.verdict !== "pass" || required.some((file) => !file || !existsSync(file))) throw new Error("Exact-commit local prerequisite range and coverage evidence is incomplete, mislabeled, or failed.");
  const output = arg("--output");
  const invariants = JSON.parse(readFileSync(arg("--comparison"), "utf8"));
  const sanitizedManifest = JSON.parse(readFileSync(arg("--sanitizer-manifest"), "utf8"));
  const authenticated = source.authenticatedRehearsal;
  validateAuthenticatedCandidateEvidence(authenticated, { requireDetectors: true });
  validateSanitizedStateBinding(authenticated.postMigrationState, invariants.sanitizedState);
  if (authenticated.postMigrationState.sourceSha256 !== sanitizedManifest.artifact?.sha256 || authenticated.postMigrationState.ledgerSha256 !== invariants.ledger?.afterSha256 || JSON.stringify(authenticated.postMigrationState.ledger) !== JSON.stringify(invariants.ledger?.after) || authenticated.transformation?.verdict !== "pass" || authenticated.handlerStateReadback !== true) throw new Error("Authenticated handlers are not bound to the exact transformed remote ledger and domain.");
  if (authenticated.commit !== arg("--commit") || authenticated.target?.environment !== "local" || authenticated.sanitizerArtifactSha256 !== sanitizedManifest.artifact?.sha256 || authenticated.migrationRange?.from !== (arg("--migration-from") === "none" ? null : arg("--migration-from")) || authenticated.migrationRange?.to !== (arg("--migration-to") === "none" ? null : arg("--migration-to"))) throw new Error("Authenticated candidate-handler rehearsal evidence is incomplete or not bound to the sanitized artifact.");
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
    policy: loadSanitizerPolicy({ repoRoot }),
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
    coverage: source.coverage,
    authenticatedRehearsal: authenticated,
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
  writeFileSync(output.replace(/\.json$/, ".md"), `# Production-shaped rehearsal: PASS\n\nCommit: ${report.commit}\nEnvironment: rehearsal\nDatabase: ${report.target.databaseName} (${report.target.databaseId})\nRecovery database: ${recovery.recoveryDatabase.name} (${recovery.recoveryDatabase.id})\nMigration: ${report.migrationRange.from} -> ${report.migrationRange.to}\nCoverage plan: ${report.coverage.planId} (${report.coverage.declarationSha256})\nSanitizer: ${sanitizedManifest.sanitizerVersion}\nSanitizer artifact: ${sanitizedManifest.artifact.sha256}\nSource date: ${sanitizedManifest.provenance.sourceDate}\nAccess owner: ${sanitizedManifest.handling.accessOwner}\nRetention deadline: ${sanitizedManifest.handling.retentionDeadline}\nAuthenticated candidate template/run reads and writes: PASS\nFalse-empty and API-error detection: PASS\nRequired affected-domain coverage: PASS\nRecovery, raw-source cleanup, database teardown: PASS\n`);
  const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const stateSummary = `\nAuthenticated post-migration state: ${authenticated.postMigrationState.domainSha256}\nExact post-migration ledger: ${authenticated.postMigrationState.ledgerSha256}\nLocal and remote transformed dataset equality: PASS\n`;
  writeFileSync(output.replace(/\.json$/, ".md"), readFileSync(output.replace(/\.json$/, ".md"), "utf8") + stateSummary);
  writeFileSync(output.replace(/\.json$/, ".junit.xml"), `<testsuite name="production-shaped-rehearsal" tests="1" failures="0"><properties><property name="commit" value="${xml(report.commit)}"/><property name="environment" value="rehearsal"/><property name="database" value="${xml(report.target.databaseName)}"/><property name="databaseId" value="${xml(report.target.databaseId)}"/><property name="recoveryDatabaseId" value="${xml(recovery.recoveryDatabase.id)}"/><property name="migration" value="${xml(`${report.migrationRange.from}->${report.migrationRange.to}`)}"/><property name="sanitizer" value="${xml(sanitizedManifest.sanitizerVersion)}"/></properties><testcase name="rehearsal-and-separate-database-restore"/></testsuite>\n`);
  const junitPath = output.replace(/\.json$/, ".junit.xml");
  writeFileSync(junitPath, readFileSync(junitPath, "utf8").replace("</properties>", `<property name="sanitizedSourceSha256" value="${authenticated.postMigrationState.sourceSha256}"/><property name="postMigrationDomainSha256" value="${authenticated.postMigrationState.domainSha256}"/><property name="postMigrationLedgerSha256" value="${authenticated.postMigrationState.ledgerSha256}"/></properties>`));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const output = arg("--output") ?? "tmp/data-reports/rehearsal/rehearsal-promotion.json";
  let sanitizerVersion = "unknown";
  try { sanitizerVersion = JSON.parse(readFileSync(arg("--sanitizer-manifest"), "utf8")).sanitizerVersion ?? "unknown"; } catch {}
  const failure = { check: "production-shaped-rehearsal", verdict: "fail", commit: arg("--commit") ?? "unknown", target: { environment: "rehearsal", databaseName: arg("--database-name"), databaseId: arg("--database-id") }, migrationRange: { from: arg("--migration-from"), to: arg("--migration-to") }, sanitizerVersion, error: message };
  const identity = `commit=${failure.commit} environment=rehearsal database=${failure.target.databaseName} databaseId=${failure.target.databaseId} migration=${failure.migrationRange.from}->${failure.migrationRange.to} sanitizer=${failure.sanitizerVersion}`;
  writeDataCheckReports({ name: "rehearsal-promotion", report: failure, summary: `BLOCKED production-shaped rehearsal: ${identity}: ${message}`, reportDirectory: path.dirname(output) });
  console.error(message);
  process.exitCode = 1;
}
