#!/usr/bin/env node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, renameSync, unlinkSync, rmSync, chmodSync, statSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";
import { validateRehearsalRecoveryEvidence } from "./rehearsal-recovery-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { resolveRehearsalPlan, validateCoverageMatch } from "./rehearsal-plan-lib.mjs";
import { validateAuthenticatedCandidateEvidence } from "./authenticated-coverage-lib.mjs";
import { validateSanitizedStateBinding, validateSanitizedCohortProof } from "./sanitized-state-lib.mjs";
import { normalizeMigrationRange, migrationRangesEqual, migrationsInRange } from "./migration-range-lib.mjs";
import { parseExactJson } from "./strict-json-lib.mjs";
import { safeCanaryFailure } from "./canary-diagnostics.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
const output = arg('--output');
let outputFamily;
const outputModes = new Map();
const publication = new Map();
function canonicalPath(file) {
  const absolute = path.resolve(file);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = path.dirname(absolute);
  return path.join(parent === absolute ? parent : canonicalPath(parent), path.basename(absolute));
}
function validateOutput() {
  if (!output || path.basename(output) === '.json' || !output.endsWith('.json')) throw new Error('Invalid report output.');
  const family = ['json', 'md', 'txt', 'junit.xml'].map(extension => path.resolve(output.replace(/\.json$/, `.${extension}`)));
  const inputs = ['--source', '--comparison', '--recovery', '--teardown', '--sanitized', '--sanitizer-manifest'].map(arg).filter(Boolean);
  const identities = new Set();
  for (const file of family) {
    let info;
    try { info = lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (info && !info.isFile()) throw new Error('Invalid report output.');
    outputModes.set(file, info ? info.mode & 0o600 : 0o600);
    const identity = canonicalPath(file).toLowerCase();
    if (identities.has(identity) || inputs.some(input => canonicalPath(input).toLowerCase() === identity ||
      (info && existsSync(input) && statSync(input).dev === info.dev && statSync(input).ino === info.ino))) throw new Error('Report output collides with evidence.');
    identities.add(identity);
  }
  return family;
}
function invalidatePublication() {
  try { unlinkSync(outputFamily[0]); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function publish(render) {
  mkdirSync(path.dirname(outputFamily[0]), { recursive: true });
  const temporary = mkdtempSync(path.join(path.dirname(outputFamily[0]), '.rehearsal-publication-'));
  try {
    render(temporary);
    for (const destination of outputFamily) {
      const staged = path.join(temporary, path.basename(destination));
      chmodSync(staged, outputModes.get(destination));
    }
    // Individual renames are atomic, not a four-file transaction. JSON is
    // authoritative only after every required companion has been replaced.
    for (const destination of [...outputFamily.slice(1), outputFamily[0]]) renameSync(path.join(temporary, path.basename(destination)), destination);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
let stage = 'data-configuration';
let sanitizerVersion = 'unknown';
const failureContext = {
  commit: /^[a-f0-9]{40}$/.test(arg('--commit') ?? '') && !/^0{40}$/.test(arg('--commit')) ? arg('--commit') : 'unknown',
  target: { environment: 'rehearsal', binding: 'DB', databaseName: 'unknown', databaseId: 'unknown' },
  migrationRange: { from: 'invalid', to: 'invalid' },
};
try {
  outputFamily = validateOutput();
  stage = 'data-reporting';
  invalidatePublication();
  stage = 'data-configuration';
  const migrationRange = normalizeMigrationRange({ from: arg("--migration-from") ?? undefined, to: arg("--migration-to") ?? undefined });
  migrationsInRange(readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort(), migrationRange);
  failureContext.migrationRange = migrationRange;
  stage = 'data-reporting';
  const source = parseExactJson(readFileSync(arg("--source"), "utf8"));
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  stage = 'data-configuration';
  const expectedPlan = resolveRehearsalPlan({ repoRoot, commit: arg("--commit"), migrationFrom: arg("--migration-from"), migrationTo: arg("--migration-to") });
  stage = 'invariant-state';
  validateCoverageMatch({ evidence: source, expected: expectedPlan });
  const required = [arg("--comparison"), arg("--recovery"), arg("--teardown")];
  if (source.verdict !== "pass" || source.commit !== arg("--commit") || source.target?.environment !== "local" || !migrationRangesEqual(source.migrationRange, migrationRange) || source.coverage?.verdict !== "pass" || required.some((file) => !file || !existsSync(file))) throw new Error("Exact-commit local prerequisite range and coverage evidence is incomplete, mislabeled, or failed.");
  stage = 'data-reporting';
  const invariants = parseExactJson(readFileSync(arg("--comparison"), "utf8"));
  const sanitizedManifest = parseExactJson(readFileSync(arg("--sanitizer-manifest"), "utf8"));
  stage = 'invariant-state';
  const authenticated = source.authenticatedRehearsal;
  if (JSON.stringify(authenticated?.sourceProfile) !== JSON.stringify(sanitizedManifest.sourceProfile) || authenticated?.manifestIntegritySha256 !== sanitizedManifest.manifestIntegritySha256) throw new Error("Authenticated source profile/manifest binding mismatch.");
  validateAuthenticatedCandidateEvidence(authenticated, { requireDetectors: true });
  validateSanitizedStateBinding(authenticated.postMigrationState, invariants.sanitizedState);
  validateSanitizedCohortProof(authenticated.cohortProof, { state: invariants.sanitizedState, selection: sanitizedManifest.selection });
  const expectedLedger = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const pending = migrationsInRange(expectedLedger, migrationRange);
  const expectedBefore = expectedLedger.slice(0, expectedLedger.length - pending.length);
  if (JSON.stringify(invariants.ledger?.before) !== JSON.stringify(expectedBefore) || JSON.stringify(invariants.ledger?.after) !== JSON.stringify(expectedLedger)) throw new Error("Rehearsal ledger must prove the complete ordered reviewed transition.");
  if (JSON.stringify(authenticated.postMigrationState.ledger) !== JSON.stringify(expectedLedger)) throw new Error("Authenticated state must use the full exact candidate migration ledger.");
  if (authenticated.postMigrationState.sourceSha256 !== sanitizedManifest.artifact?.sha256 || authenticated.postMigrationState.ledgerSha256 !== invariants.ledger?.afterSha256 || JSON.stringify(authenticated.postMigrationState.ledger) !== JSON.stringify(invariants.ledger?.after) || authenticated.transformation?.verdict !== "pass" || authenticated.handlerStateReadback !== true) throw new Error("Authenticated handlers are not bound to the exact transformed remote ledger and domain.");
  if (authenticated.commit !== arg("--commit") || authenticated.target?.environment !== "local" || authenticated.sanitizerArtifactSha256 !== sanitizedManifest.artifact?.sha256 || !migrationRangesEqual(authenticated.migrationRange, migrationRange)) throw new Error("Authenticated candidate-handler rehearsal evidence is incomplete or not bound to the sanitized artifact.");
  stage = 'data-restore';
  const recovery = validateRehearsalRecoveryEvidence({
    evidence: parseExactJson(readFileSync(arg("--recovery"), "utf8")),
    sourceDatabaseId: arg("--database-id"),
    recoveryDatabaseId: arg("--recovery-database-id"),
    expectedCommit: arg("--commit"),
    expectedEnvironment: "rehearsal",
    expectedMigrationFrom: arg("--migration-from"),
    expectedMigrationTo: arg("--migration-to"),
    expectedSanitizerVersion: sanitizedManifest?.sanitizerVersion,
  });
  const recoveryPass = recovery.verdict === "pass";
  if (JSON.stringify(recovery.sanitizer.sourceProfile) !== JSON.stringify(sanitizedManifest.sourceProfile) || recovery.sanitizer.manifestIntegritySha256 !== sanitizedManifest.manifestIntegritySha256 || recovery.sanitizer.artifactSha256 !== sanitizedManifest.artifact.sha256) throw new Error("Recovery source profile/manifest binding mismatch.");
  stage = 'data-export';
  validateSanitizedRehearsalArtifact({
    sql: readFileSync(arg("--sanitized"), "utf8"),
    manifest: sanitizedManifest,
    policy: loadSanitizerPolicy({ repoRoot }),
    now: new Date(),
    migrationRange,
    sourceSchema: expectedPlan.preMigration,
  });
  sanitizerVersion = sanitizedManifest.sanitizerVersion;
  stage = 'data-delete';
  const teardownPass = /PASS rehearsal .* is absent/.test(readFileSync(arg("--teardown"), "utf8"));
  const remoteTarget = { environment: "rehearsal", binding: "DB", databaseName: arg("--database-name"), databaseId: arg("--database-id") };
  const remoteBound = invariants.verdict === "pass" && invariants.commit === arg("--commit") && invariants.comparisonKind === "migration" && JSON.stringify(invariants.target) === JSON.stringify(remoteTarget) && migrationRangesEqual(invariants.migrationRange, migrationRange) && invariants.ledger?.verdict === "pass";
  if (remoteBound) failureContext.target = remoteTarget;
  if (!remoteBound || !recoveryPass || !teardownPass) throw new Error("Remote rehearsal identity, migration ledger, invariants, recovery, or confirmed teardown failed.");
  const report = {
    check: "production-shaped-rehearsal",
    verdict: "pass",
    commit: arg("--commit"),
    target: remoteTarget,
    migrationRange,
    localPrerequisite: source,
    coverage: source.coverage,
    authenticatedRehearsal: authenticated,
    remoteRehearsal: { target: remoteTarget, migrationRange: invariants.migrationRange, invariants },
    recovery,
    sanitizedSource: {
      verdict: "pass",
      attestation: { verdict: "pass", verifier: "github-cli-before-import" },
      sanitizerVersion: sanitizedManifest.sanitizerVersion,
      selection: sanitizedManifest.selection,
      sourceProfile: sanitizedManifest.sourceProfile,
      observedSourceShapes: sanitizedManifest.selection.observedSourceShapes,
      absentSourceShapes: sanitizedManifest.selection.absentSourceShapes,
      syntheticEdgeCaseRequirements: sanitizedManifest.selection.syntheticEdgeCaseRequirements,
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
  stage = 'data-reporting';
  publication.set(output, JSON.stringify(report, null, 2) + "\n");
  publication.set(output.replace(/\.json$/, ".md"), `# Production-shaped rehearsal: PASS\n\nCommit: ${report.commit}\nEnvironment: rehearsal\nDatabase: ${report.target.databaseName} (${report.target.databaseId})\nRecovery database: ${recovery.recoveryDatabase.name} (${recovery.recoveryDatabase.id})\nMigration: ${report.migrationRange.from} -> ${report.migrationRange.to}\nCoverage plan: ${report.coverage.planId} (${report.coverage.declarationSha256})\nSanitizer: ${sanitizedManifest.sanitizerVersion}\nSanitizer artifact: ${sanitizedManifest.artifact.sha256}\nSource date: ${sanitizedManifest.provenance.sourceDate}\nAccess owner: ${sanitizedManifest.handling.accessOwner}\nRetention deadline: ${sanitizedManifest.handling.retentionDeadline}\nAuthenticated candidate template/run reads and writes: PASS\nFalse-empty and API-error detection: PASS\nRequired affected-domain coverage: PASS\nRecovery, raw-source cleanup, database teardown: PASS\n`);
  const xml = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const stateSummary = `\nSource profile: ${sanitizedManifest.sourceProfile.profile}\nSource schema: ${sanitizedManifest.sourceProfile.sourceSchema}\nObserved source shapes: ${sanitizedManifest.selection.observedSourceShapes.join(", ") || "none"}\nAbsent source shapes: ${sanitizedManifest.selection.absentSourceShapes.join(", ") || "none"}\nSeparate synthetic edge-case requirements: ${sanitizedManifest.selection.syntheticEdgeCaseRequirements.join(", ") || "none"}\nAuthenticated post-migration state: ${authenticated.postMigrationState.domainSha256}\nExact post-migration ledger: ${authenticated.postMigrationState.ledgerSha256}\nLocal and remote transformed dataset equality: PASS\n`;
  const cohortSummary = `Selected cohort: ${JSON.stringify(sanitizedManifest.selection.selectedCounts)}\nSource counts: ${JSON.stringify(sanitizedManifest.selection.sourceCounts)}\nCohort bounds: ${JSON.stringify(sanitizedManifest.selection.cohortLimits)}\nObserved ownership and roles: ${sanitizedManifest.selection.ownershipCoverage.source.join(', ')}\nProfile exclusions (not covered): ${sanitizedManifest.selection.profileExclusions.join(', ')}\nSelected authorization cohort digest: ${authenticated.postMigrationState.cohortSha256}\nAuthenticated cohort measurements: ${JSON.stringify(authenticated.cohortProof.measurements)}\nPost-handler source preservation: ${JSON.stringify(authenticated.cohortProof.postHandlerPreservation)}\n`;
  publication.set(output.replace(/\.json$/, ".md"), publication.get(output.replace(/\.json$/, ".md")) + stateSummary + cohortSummary);
  publication.set(output.replace(/\.json$/, ".junit.xml"), `<testsuite name="production-shaped-rehearsal" tests="1" failures="0"><properties><property name="commit" value="${xml(report.commit)}"/><property name="environment" value="rehearsal"/><property name="database" value="${xml(report.target.databaseName)}"/><property name="databaseId" value="${xml(report.target.databaseId)}"/><property name="recoveryDatabaseId" value="${xml(recovery.recoveryDatabase.id)}"/><property name="migration" value="${xml(`${report.migrationRange.from}->${report.migrationRange.to}`)}"/><property name="sanitizer" value="${xml(sanitizedManifest.sanitizerVersion)}"/></properties><testcase name="rehearsal-and-separate-database-restore"/></testsuite>\n`);
  const junitPath = output.replace(/\.json$/, ".junit.xml");
  publication.set(junitPath, publication.get(junitPath).replace("</properties>", `<property name="sanitizedSourceSha256" value="${authenticated.postMigrationState.sourceSha256}"/><property name="postMigrationDomainSha256" value="${authenticated.postMigrationState.domainSha256}"/><property name="postMigrationLedgerSha256" value="${authenticated.postMigrationState.ledgerSha256}"/></properties>`));
  publication.set(output.replace(/\.json$/, '.txt'), publication.get(output.replace(/\.json$/, '.md')));
  publish(directory => {
    for (const [file, contents] of publication) writeFileSync(path.join(directory, path.basename(file)), contents, { mode: 0o600, flag: 'wx' });
  });
} catch (error) {
  const diagnostic = safeCanaryFailure(stage, error);
  const message = diagnostic.message;
  const failure = { check: "production-shaped-rehearsal", verdict: "fail", ...failureContext, sanitizerVersion, failedStage: diagnostic.stage, errorCode: diagnostic.code, checks: [{ name: diagnostic.check, verdict: 'fail' }], error: message };
  const identity = `commit=${failure.commit} environment=rehearsal database=${failure.target.databaseName} databaseId=${failure.target.databaseId} migration=${failure.migrationRange.from}->${failure.migrationRange.to} sanitizer=${failure.sanitizerVersion}`;
  console.error(message);
  process.exitCode = 1;
  if (outputFamily) {
    try {
      invalidatePublication();
      publish(directory => writeDataCheckReports({ name: path.basename(output, '.json'), report: failure, summary: `BLOCKED production-shaped rehearsal: ${identity}: ${message}`, reportDirectory: directory }));
    } catch (publicationError) {
      console.error(safeCanaryFailure('data-reporting', publicationError).message);
      try { invalidatePublication(); }
      catch (invalidationError) { console.error(safeCanaryFailure('data-reporting', invalidationError).message); }
    }
  }
}
