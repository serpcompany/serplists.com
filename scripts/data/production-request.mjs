#!/usr/bin/env node
import { parseExactJson } from "./strict-json-lib.mjs";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, lstatSync, statSync, unlinkSync, chmodSync } from "node:fs";
import path from "node:path";
import { assertMigrationClassification, validatePromotionEvidence } from "./production-executor-lib.mjs";
import { loadEnvironmentInventory } from "./environment-identity-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { resolveRehearsalPlan, validateCoverageMatch } from "./rehearsal-plan-lib.mjs";
import { normalizeMigrationRange, migrationsInRange, rangeFromPending } from "./migration-range-lib.mjs";
import { selectRangeEvidence } from "./select-range-evidence.mjs";
import { evaluateInvariantLedgerTransition } from "./remote-invariant-evidence-lib.mjs";
import { safeCanaryFailure } from './canary-diagnostics.mjs';
import { validateReportIdentity, reportIdentitySummary } from './report-identity-lib.mjs';

function arg(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  const value = indexes.length === 1 ? process.argv[indexes[0] + 1] : null;
  return value && !value.startsWith('--') ? value : null;
}

const output = arg('--output');
const failureDirectory = 'tmp/data-reports/production-request';
const reportDirectory = output ? path.join(path.dirname(output), 'reports') : null;
const reportFiles = directory => ['json', 'md', 'txt', 'junit.xml'].map(ext => path.resolve(directory, `production-request.${ext}`));
const ownedFiles = [];
let stage = 'production-configuration';
const context = {
  commit: /^[a-f0-9]{40}$/.test(arg('--commit') ?? '') && !/^0{40}$/.test(arg('--commit')) ? arg('--commit') : 'unknown',
  target: { environment: 'production', binding: 'DB', databaseName: 'unknown', databaseId: 'unknown' },
  migrationRange: { from: 'invalid', to: 'invalid' },
};
function invalidate(files) {
  let failed = false;
  for (const file of files) {
    try { unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') failed = true; }
  }
  if (failed) throw new Error('Publication invalidation failed.');
}
function publishReport(directory, report, summary) {
  const files = reportFiles(directory);
  if (!files.every(file => ownedFiles.includes(file))) throw new Error('Invalid report destination.');
  try {
    writeDataCheckReports({ name: 'production-request', report, summary, reportDirectory: directory });
    for (const file of files) chmodSync(file, 0o600);
  } catch (error) {
    invalidate(files);
    throw error;
  }
}

try {
  stage = 'data-reporting';
  const inputs = ['--ci-report', '--correction-report', '--schema-report', '--rehearsal-report', '--staging-report', '--ci-run-metadata', '--staging-run-metadata', '--merge-commit', '--change-provenance'].map(arg).filter(Boolean);
  const candidates = [...new Set([...reportFiles(failureDirectory), ...(reportDirectory ? reportFiles(reportDirectory) : []), ...(output ? [path.resolve(output)] : [])])];
  // Do not remove or overwrite evidence inputs, symlinks, or directories.
  let invalidDestination = false;
  for (const file of candidates) {
    try {
      let info;
      try { info = lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (info && !info.isFile()) throw new Error('Invalid publication destination.');
      if (inputs.some(input => {
        if (path.resolve(input) === file) return true;
        try { const source = statSync(input); return info && source.dev === info.dev && source.ino === info.ino; } catch { return false; }
      }) || (arg('--ci-directory') && !path.relative(path.resolve(arg('--ci-directory')), file).startsWith('..'))) throw new Error('Publication collides with input.');
      ownedFiles.push(file);
    } catch { invalidDestination = true; }
  }
  invalidate(ownedFiles);
  if (invalidDestination) throw new Error('Invalid publication destination.');
  stage = 'production-configuration';
  const commit = arg("--commit");
  const from = arg("--migration-from");
  const to = arg("--migration-to");
  const databaseName = arg("--database-name");
  const databaseId = arg("--database-id");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const production = loadEnvironmentInventory({ repoRoot }).environments.production;
  if (databaseName === production.databaseName) context.target.databaseName = databaseName;
  if (databaseId === production.databaseId) context.target.databaseId = databaseId;
  const migrations = readdirSync(path.join(repoRoot, "db/migrations"))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const migrationRange = normalizeMigrationRange({ from: from ?? undefined, to: to ?? undefined });
  const pendingMigrations = migrationsInRange(migrations, migrationRange);
  rangeFromPending(migrations, pendingMigrations);
  context.migrationRange = migrationRange;
  if (databaseName !== production.databaseName || databaseId !== production.databaseId) {
    throw new Error("Requested production database does not match the checked-in allowlist.");
  }
  validateReportIdentity(context);
  const classification = arg("--classification");
  assertMigrationClassification({
    requested: classification,
    sqlTexts: pendingMigrations.map((name) => readFileSync(path.join(repoRoot, "db/migrations", name), "utf8")),
  });
  const ci = arg("--ci-directory") ? selectRangeEvidence(arg("--ci-directory"), migrationRange).report : parseExactJson(readFileSync(arg("--ci-report"), "utf8"));
  const ciContractCorrection = parseExactJson(readFileSync(arg("--correction-report"), "utf8"));
  const ciSchemaContract = parseExactJson(readFileSync(arg("--schema-report"), "utf8"));
  const rehearsal = parseExactJson(readFileSync(arg("--rehearsal-report"), "utf8"));
  const staging = parseExactJson(readFileSync(arg("--staging-report"), "utf8"));
  const ciRun = parseExactJson(readFileSync(arg("--ci-run-metadata"), "utf8"));
  const stagingRun = parseExactJson(readFileSync(arg("--staging-run-metadata"), "utf8"));
  const mergeCommit = parseExactJson(readFileSync(arg("--merge-commit"), "utf8"));
  const changeProvenance = parseExactJson(readFileSync(arg("--change-provenance"), "utf8"));
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
  stage = 'data-reporting';
  publishReport(reportDirectory, { check: 'production-request', verdict: 'pass', ...context, pendingMigrations, coverage: ci.coverage, stagingMigrationRange: stagingRange }, `PASS production request ${reportIdentitySummary(context)}; exact-commit CI, reviewed hashes and staging ledger verified. Production approval is still required.`);
  // Publish the authoritative request only after all companion formats succeed.
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600, flag: 'wx' });
  console.log(`Validated exact-commit production request for ${commit}.`);
} catch (error) {
  const diagnostic = safeCanaryFailure(stage, error);
  const failure = { check: 'production-request', verdict: 'fail', ...context, failedStage: stage === 'data-reporting' ? stage : 'production-request-validation', diagnosticStage: diagnostic.stage, errorCode: diagnostic.code, checks: [{ name: diagnostic.check, verdict: 'fail' }], error: diagnostic.message };
  process.exitCode = 1;
  console.error(`${diagnostic.stage} ${diagnostic.code}: ${diagnostic.message}`);
  try { invalidate(ownedFiles); }
  catch (publicationError) { console.error(safeCanaryFailure('data-reporting', publicationError).message); }
  for (const directory of new Set([failureDirectory, reportDirectory].filter(Boolean))) {
    try { publishReport(directory, failure, `BLOCKED production request ${reportIdentitySummary(context)}: ${diagnostic.message}`); }
    catch (publicationError) { console.error(safeCanaryFailure('data-reporting', publicationError).message); }
  }
}
