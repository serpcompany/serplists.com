#!/usr/bin/env node
import { readFileSync, readdirSync, lstatSync, statSync, unlinkSync, chmodSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";
import { normalizeMigrationRange, migrationRangesEqual } from "./migration-range-lib.mjs";
import { evaluateInvariantLedgerTransition } from "./remote-invariant-evidence-lib.mjs";
import { validateControlledCanaryChecks } from "./deployment-smoke-lib.mjs";
import { safeCanaryFailure } from "./canary-diagnostics.mjs";
import { validateReportIdentity, reportIdentitySummary } from './report-identity-lib.mjs';
import { parseExactJson } from './strict-json-lib.mjs';

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
function read(name) { return parseExactJson(readFileSync(arg(name), "utf8")); }

const commit = arg("--commit") ?? "unknown";
const tree = /^[a-f0-9]{40}$/.test(arg('--tree') ?? '') && !/^0{40}$/.test(arg('--tree')) ? arg('--tree') : 'unknown';
const databaseName = arg("--database-name") ?? "unknown";
const databaseId = arg("--database-id") ?? "unknown";
const output = arg("--output") ?? "tmp/data-reports/staging-promotion/staging-promotion.json";
let report;
const publicationFiles = ['json', 'md', 'txt', 'junit.xml'].map(ext => path.resolve(path.dirname(output), `staging-promotion.${ext}`));
const ownedFiles = [];
function invalidatePublication() {
  let failed = false;
  for (const file of ownedFiles) {
    try { unlinkSync(file); } catch (error) { if (error.code !== 'ENOENT') failed = true; }
  }
  if (failed) throw new Error('Publication invalidation failed.');
}
let identitySnapshot = { commit: 'unknown', target: { environment: 'staging', binding: 'unknown', databaseName: 'unknown', databaseId: 'unknown' }, migrationRange: { from: 'invalid', to: 'invalid' } };
try {
  const inputs = ['--range', '--data', '--schema', '--invariants', '--deploy', '--smoke'].map(arg).filter(Boolean);
  let invalidDestination = false;
  for (const file of publicationFiles) {
    try {
      let info;
      try { info = lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (info && !info.isFile()) throw new Error('Invalid publication destination.');
      if (inputs.some(input => {
        if (path.resolve(input) === file) return true;
        try { const source = statSync(input); return info && source.dev === info.dev && source.ino === info.ino; } catch { return false; }
      })) throw new Error('Publication collides with evidence.');
      ownedFiles.push(file);
    } catch { invalidDestination = true; }
  }
  invalidatePublication();
  if (invalidDestination) throw new Error('Invalid publication destination.');
  if (tree === 'unknown') throw new Error('Invalid staging tree.');
  const range = read("--range");
  range.migrationRange = normalizeMigrationRange(range.migrationRange);
  const identity = validateReportIdentity({ commit, target: { environment: 'staging', binding: arg('--binding'), databaseName, databaseId }, migrationRange: range.migrationRange });
  identitySnapshot = identity;
  const data = read("--data");
  if (!migrationRangesEqual(data.migrationRange, range.migrationRange) || data.coverage?.verdict !== "pass" || JSON.stringify(Object.fromEntries(Object.keys(range.coverage ?? {}).map((key) => [key, data.coverage?.[key]]))) !== JSON.stringify(range.coverage)) throw new Error("Staging CI range and reviewed coverage do not match the actual pending range.");
  const schema = read("--schema");
  const invariants = read("--invariants");
  const deploy = read("--deploy");
  const smoke = read("--smoke");
  for (const evidence of [range, invariants, deploy, smoke]) validateReportIdentity(evidence, identity);
  validateControlledCanaryChecks(smoke);
  const exactCommit = [data.commit, range.commit, schema.commit, invariants.commit, deploy.commit, smoke.commit].every((value) => value === commit);
  const exactTarget = range.target?.environment === "staging" && range.target?.databaseName === databaseName &&
    range.target?.databaseId === databaseId && schema.target?.environment === "staging" && schema.target?.binding === "DB" && schema.target?.databaseName === databaseName &&
    schema.target?.databaseId === databaseId && deploy.target?.environment === "staging" &&
    invariants.target?.environment === "staging" && invariants.target?.binding === "DB" && invariants.target?.databaseName === databaseName && invariants.target?.databaseId === databaseId &&
    deploy.target?.databaseName === databaseName && deploy.target?.databaseId === databaseId &&
    smoke.target?.environment === "staging" && smoke.target?.databaseName === databaseName &&
    smoke.target?.databaseId === databaseId;
  const schemaMigrations = readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => /^\d{4}_.+\.sql$/.test(name)).sort();
  if (!migrationRangesEqual(schema.migrationRange, {from:schemaMigrations[0],to:schemaMigrations.at(-1)})) throw new Error('Post-migration schema evidence must cover the complete candidate migration chain.');
  const exactInvariantRange = invariants.comparisonKind === "migration" && migrationRangesEqual(invariants.migrationRange, range.migrationRange);
  const ledgerTransition = evaluateInvariantLedgerTransition({ before: invariants.ledger?.before ?? [], after: invariants.ledger?.after ?? [], comparisonKind: "migration", expectedRange: range.migrationRange, expectedMigrations: range.pendingMigrations ?? [] });
  if (!exactCommit || !exactTarget || !exactInvariantRange || ledgerTransition.verdict !== "pass" || invariants.ledger?.verdict !== "pass" || deploy.tree !== tree) throw new Error("Staging evidence identity, invariant range, or ordered ledger transition does not match the exact commit, tree, environment, and database.");
  if (data.verdict !== "pass" || data.teardown?.verdict !== "pass" || range.verdict !== "pass" || schema.verdict !== "pass" ||
      schema.ledger?.verdict !== "pass" || invariants.verdict !== "pass" || deploy.verdict !== "pass" || smoke.verdict !== "pass" ||
      !Array.isArray(smoke.failures) || smoke.failures.length) {
    throw new Error("Staging data, migration ledger, invariants, deploy, authenticated/custom-domain smoke, and teardown must all pass.");
  }
  report = {
    check: "staging-promotion",
    verdict: "pass",
    commit,
    tree,
    target: identity.target,
    baseCommit: range.baseCommit,
    migrationRange: range.migrationRange,
    pendingMigrations: range.pendingMigrations,
    data: { verdict: data.verdict, teardown: data.teardown, migrationRange: range.migrationRange, coverage: data.coverage },
    schema: { verdict: schema.verdict, ledger: schema.ledger },
    invariants: { verdict: invariants.verdict, migrationRange: invariants.migrationRange, ledger: invariants.ledger },
    deploy: { verdict: deploy.verdict },
    smoke: { verdict: smoke.verdict, failures: smoke.failures, controlledCanaryMutationApproved: smoke.controlledCanaryMutationApproved, checks: smoke.checks, canaryEvidenceDigest: smoke.canaryEvidenceDigest },
    teardown: data.teardown,
  };
} catch (error) {
  // Input/IO errors can embed private filenames or source text. Keep the
  // validated identity above, but publish only allowlisted diagnostics.
  const inputFailure = safeCanaryFailure('staging-promotion-input', error);
  report = {
    check: "staging-promotion",
    verdict: "fail",
    ...identitySnapshot,
    tree,
    failedStage: error instanceof SyntaxError || typeof error?.code === 'string' ? inputFailure.stage : 'finalize-staging-promotion',
    diagnosticStage: inputFailure.stage,
    errorCode: inputFailure.code, checks: [{ name: inputFailure.check, verdict: 'fail' }],
    error: inputFailure.message,
  };
}
const summary = `${report.verdict.toUpperCase()} staging promotion; ${reportIdentitySummary(report)}; tree ${tree}${report.error ? `: ${report.error}` : "."}`;
if (report.verdict !== "pass") process.exitCode = 1;
try {
  if (ownedFiles.length !== publicationFiles.length) throw new Error('Invalid publication destination.');
  writeDataCheckReports({ name: 'staging-promotion', report, summary, reportDirectory: path.dirname(output) });
  for (const file of publicationFiles) chmodSync(file, 0o600);
} catch (error) {
  process.exitCode = 1;
  const failure = safeCanaryFailure('data-reporting', error);
  console.error(`${failure.stage} ${failure.code}: ${failure.message}`);
  try { invalidatePublication(); }
  catch (publicationError) { console.error(safeCanaryFailure('data-reporting', publicationError).message); }
}
