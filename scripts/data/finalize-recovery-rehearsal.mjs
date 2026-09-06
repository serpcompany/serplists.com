#!/usr/bin/env node
import { parseExactJson } from "./strict-json-lib.mjs";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, rmSync, lstatSync, realpathSync, statSync, unlinkSync, chmodSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { normalizeMigrationRange, migrationRangesEqual, migrationsInRange } from "./migration-range-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { fullRecoveryStatesEqual } from "./recovery-restore-lib.mjs";
import { safeCanaryFailure } from "./canary-diagnostics.mjs";
import { reportIdentitySummary } from "./report-identity-lib.mjs";

function arg(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  const value = indexes.length === 1 ? process.argv[indexes[0] + 1] : null;
  return value && !value.startsWith('--') ? value : null;
}

const output = arg('--output') ?? 'tmp/data-reports/rehearsal/recovery-rehearsal.json';
const context = {
  commit: /^[a-f0-9]{40}$/.test(arg('--commit') ?? '') && !/^0{40}$/.test(arg('--commit')) ? arg('--commit') : 'unknown',
  target: { environment: arg('--environment') === 'rehearsal' ? 'rehearsal' : 'unknown', binding: 'DB', databaseName: 'unknown', databaseId: 'unknown' },
  sourceDatabase: { name: 'unknown', id: 'unknown' },
  migrationRange: { from: 'invalid', to: 'invalid' },
};
for (const [prefix, target, nameKey, idKey] of [['source', context.sourceDatabase, 'name', 'id'], ['recovery', context.target, 'databaseName', 'databaseId']]) {
  const name = arg(`--${prefix}-database-name`), id = arg(`--${prefix}-database-id`);
  if (/^[a-z0-9][a-z0-9-]{0,62}$/.test(name ?? '')) target[nameKey] = name;
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id ?? '')) target[idKey] = id;
}
let stage = 'data-configuration';
let publicationFiles = [];
let publicationValidated = false;
function invalidatePublication() {
  let failed = false;
  for (const file of publicationFiles) {
    try { unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') failed = true; }
  }
  if (failed) throw new Error('Report invalidation failed.');
}
function publish(report, summary) {
  mkdirSync(path.dirname(output), { recursive: true });
  const temporary = mkdtempSync(path.join(path.dirname(output), '.recovery-publication-'));
  try {
    const rendered = writeDataCheckReports({ name: 'recovery-rehearsal', report, summary, reportDirectory: temporary });
    // Render completely before publishing; authoritative JSON is published last.
    for (const key of ['junit', 'markdown', 'text', 'json']) {
      chmodSync(rendered[key], 0o600);
      renameSync(rendered[key], path.join(path.dirname(output), path.basename(rendered[key])));
    }
    if (path.resolve(output) !== path.resolve(path.dirname(output), 'recovery-rehearsal.json')) writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

try {
  const inputs = ['--comparison', '--import-evidence', '--teardown', '--raw', '--sanitizer-manifest', '--sanitized', '--source-creation', '--recovery-creation'].map(arg).filter(Boolean);
  const candidates = [...new Set([path.resolve(output), ...['json', 'md', 'txt', 'junit.xml'].map(ext => path.resolve(path.dirname(output), `recovery-rehearsal.${ext}`))])];
  for (const file of candidates) {
    // Never invalidate an input, symlink, or directory supplied as an output.
    const info = existsSync(file) ? lstatSync(file) : null;
    if (info && !info.isFile()) continue;
    if (inputs.some(input => path.resolve(input) === file || (info && existsSync(input) && (realpathSync(input) === realpathSync(file) || (statSync(input).dev === info.dev && statSync(input).ino === info.ino))))) throw new Error('Report collides with input.');
    publicationFiles.push(file);
  }
  stage = 'data-reporting';
  invalidatePublication();
  if (publicationFiles.length !== candidates.length) throw new Error('Invalid report destination.');
  publicationValidated = true;
  stage = 'data-configuration';
  const range = normalizeMigrationRange({ from: arg('--migration-from') ?? undefined, to: arg('--migration-to') ?? undefined });
  migrationsInRange(readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort(), range);
  context.migrationRange = range;
  if (context.commit === 'unknown' || Object.values(context.target).includes('unknown') || Object.values(context.sourceDatabase).includes('unknown')) throw new Error('Invalid recovery context.');
  stage = 'data-reporting';
  const comparison = parseExactJson(readFileSync(arg("--comparison"), "utf8"));
  const importEvidence = parseExactJson(readFileSync(arg("--import-evidence"), "utf8"));
  const teardown = readFileSync(arg("--teardown"), "utf8");
  const sourceDatabaseName = arg("--source-database-name");
  const recoveryDatabaseName = arg("--recovery-database-name");
  const rawPath = arg("--raw");
  const manifest = parseExactJson(readFileSync(arg("--sanitizer-manifest"), "utf8"));
  const sourceCreationBytes = readFileSync(arg("--source-creation"));
  const recoveryCreationBytes = readFileSync(arg("--recovery-creation"));
  const sourceCreation = parseExactJson(sourceCreationBytes);
  const recoveryCreation = parseExactJson(recoveryCreationBytes);
  const commit = arg("--commit");
  const environment = arg("--environment");
  stage = 'data-restore';
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
    invariants: { verdict: "pass", evidenceSha256: createHash("sha256").update(readFileSync(arg("--comparison"))).digest("hex"), domainDigest: comparison.postDomainDigest },
    absence: { verdict: "pass", evidenceSha256: createHash("sha256").update(readFileSync(arg("--teardown"))).digest("hex") },
    rawPlaintextRetained: false,
  };
  stage = 'data-reporting';
  publish({ check: 'recovery-rehearsal', ...evidence, target: context.target, migrationRange: evidence.migration, sanitizerVersion: evidence.sanitizer.version }, `PASS recovery rehearsal ${reportIdentitySummary(context)} sanitizer=${evidence.sanitizer.version}.`);
} catch (error) {
  const diagnostic = safeCanaryFailure(stage, error);
  const failure = { check: 'recovery-rehearsal', verdict: 'fail', ...context, sanitizerVersion: 'unknown', failedStage: diagnostic.stage, errorCode: diagnostic.code, checks: [{ name: diagnostic.check, verdict: 'fail' }], error: diagnostic.message };
  process.exitCode = 1;
  console.error(diagnostic.message);
  try {
    invalidatePublication();
    if (publicationValidated) publish(failure, `BLOCKED recovery rehearsal ${reportIdentitySummary(context)}: ${diagnostic.message}`);
  } catch (publicationError) {
    console.error(safeCanaryFailure('data-reporting', publicationError).message);
    try { invalidatePublication(); } catch (invalidationError) { console.error(safeCanaryFailure('data-reporting', invalidationError).message); }
  }
}
