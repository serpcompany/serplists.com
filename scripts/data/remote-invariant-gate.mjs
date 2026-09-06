#!/usr/bin/env node
import { parseExactJson } from "./strict-json-lib.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureRemoteInvariantSnapshot, compareProductionInvariants } from "./invariant-capture-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { reportIdentitySummary } from "./report-identity-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { evaluateInvariantLedgerTransition, validatePreInvariantEvidence, validateRemoteInvariantContext } from "./remote-invariant-evidence-lib.mjs";
import { captureSanitizedState } from "./sanitized-state-lib.mjs";
import { createHash } from "node:crypto";
import { migrationsInRange, migrationRangeForReport } from "./migration-range-lib.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from './canary-diagnostics.mjs';
import { captureFullRecoveryState, fullRecoveryStatesEqual } from './recovery-restore-lib.mjs';
import { assertRepositoryKnownLedger, privacySafeLedgerProjection } from './ledger-reporting-lib.mjs';
import { loadEnvironmentInventory, validateEnvironmentInventory, resolveEnvironmentIdentity } from './environment-identity-lib.mjs';

function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
const mode = process.argv[2];
const database = arg("--database");
const state = arg("--state");
const reportDirectory = arg("--report-dir") ?? "tmp/data-reports/remote-invariants";
const context = {
  commit: arg("--commit"),
  target: { environment: arg("--environment"), binding: arg("--binding"), databaseName: database, databaseId: arg("--database-id") },
  expectedMigrationRange: { from: arg("--migration-from") ?? undefined, to: arg("--migration-to") ?? undefined },
  comparisonKind: arg("--comparison-kind") ?? "migration",
};
const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
let stage = 'invariant-configuration';
let failureLedgerProjection = null;
function expectedMigrations() {
  const files = readdirSync(new URL("../../db/migrations/", import.meta.url)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  return migrationsInRange(files, context.expectedMigrationRange);
}
function repositoryMigrations() {
  return readdirSync(new URL("../../db/migrations/", import.meta.url)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
}
// Untrusted CLI values are never report metadata until independently checked.
// Keep safe fields even if another field fails; do not infer missing identities.
function safeReportContext() {
  const target = {
    environment: ['local', 'staging', 'rehearsal', 'production'].includes(context.target.environment) ? context.target.environment : 'unknown',
    binding: context.target.binding === 'DB' ? 'DB' : 'unknown',
    databaseName: 'unknown', databaseId: 'unknown',
  };
  try {
    const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
    const inventory = loadEnvironmentInventory({ repoRoot });
    validateEnvironmentInventory({ inventory, wranglerToml: readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8') });
    if (target.binding === 'DB' && context.target.databaseName && context.target.databaseId) {
      const identity = resolveEnvironmentIdentity({ ...context.target, inventory });
      target.databaseName = identity.databaseName;
      target.databaseId = identity.databaseId;
    }
  } catch { /* Rejected identity and resolver diagnostics must remain private. */ }
  let migrationRange = { from: 'invalid', to: 'invalid' };
  try {
    const candidate = migrationRangeForReport(context.expectedMigrationRange);
    migrationsInRange(repositoryMigrations(), candidate);
    migrationRange = candidate;
  } catch { /* Only repository-confirmed ranges can be published. */ }
  return {
    commit: /^[a-f0-9]{40}$/.test(context.commit ?? '') && !/^0{40}$/.test(context.commit) ? context.commit : 'unknown',
    target, migrationRange,
    comparisonKind: ['migration', 'recovery'].includes(context.comparisonKind) ? context.comparisonKind : 'unknown',
  };
}
const reportContext = safeReportContext();
function safeLedger(observedMigrations) {
  return privacySafeLedgerProjection({ repositoryMigrations: repositoryMigrations(), observedMigrations });
}
function wrangler(args) {
  try { return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...args], { encoding: "utf8", env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { throw wrapCanarySubprocessFailure(stage, error); }
}
function verifyLiveIdentity(target) {
  stage = 'invariant-identity';
  const live = extractD1Identity(wrangler(["d1", "info", target.databaseName, "--json"]));
  if (live.databaseId !== target.databaseId || live.databaseName !== target.databaseName) throw new Error(`Live invariant target mismatch for ${target.environment}.`);
}
function capture(target) {
  verifyLiveIdentity(target);
  stage = 'invariant-query';
  const snapshot = captureRemoteInvariantSnapshot({
    database: target.databaseName,
    key: process.env.INVARIANT_HMAC_KEY,
    runWrangler: wrangler,
    validateLedger: (observedMigrations) => {
      failureLedgerProjection = safeLedger(observedMigrations);
      return assertRepositoryKnownLedger({ repositoryMigrations: repositoryMigrations(), observedMigrations });
    },
  });
  if (context.comparisonKind === "recovery") snapshot.fullRecovery = captureFullRecoveryState({
    key: process.env.INVARIANT_HMAC_KEY,
    query: sql => wrangler(["d1", "execute", target.databaseName, "--remote", "--json", "--command", sql]),
  });
  verifyLiveIdentity(target);
  return snapshot;
}
try {
  if (reportContext.commit === 'unknown' || Object.values(reportContext.target).includes('unknown') || reportContext.migrationRange.from === 'invalid' || reportContext.comparisonKind === 'unknown') throw new Error('Remote invariant report context is missing or invalid.');
  validateRemoteInvariantContext(context);
  if (!state || !["capture", "compare"].includes(mode)) throw new Error("Remote invariant gate arguments are incomplete.");
  if (mode === "capture") {
    const snapshot = capture(context.target);
    stage = 'invariant-comparison';
    const evidence = { schemaVersion: 1, check: "remote-invariant-capture", verdict: "pass", ...context, snapshot };
    mkdirSync(path.dirname(state), { recursive: true });
    writeFileSync(state, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
    const ledgerProjection = safeLedger(snapshot.appliedMigrations);
    writeDataCheckReports({ name: "remote-invariant-capture", report: { ...evidence, migrationRange: context.expectedMigrationRange, ledger: { applied: ledgerProjection.knownMigrations, appliedThrough: ledgerProjection.appliedThrough, sha256: ledgerProjection.observedSha256, status: ledgerProjection.status, observedCount: ledgerProjection.observedCount, knownCount: ledgerProjection.knownCount, unknownCount: ledgerProjection.unknownCount } }, summary: `PASS remote invariant capture ${reportIdentitySummary({ ...context, migrationRange: context.expectedMigrationRange })}; ledger=${ledgerProjection.appliedThrough}.`, reportDirectory });
  } else {
    stage = 'invariant-state';
    const pre = parseExactJson(readFileSync(state, "utf8"));
    validatePreInvariantEvidence({ pre, context });
    const post = capture(context.target);
    stage = 'invariant-comparison';
    const comparison = compareProductionInvariants({ pre: pre.snapshot.invariants, post: post.invariants, preHasEvolution: pre.snapshot.hasEvolution, postHasEvolution: post.hasEvolution, preDomain: pre.snapshot.domain, postDomain: post.domain });
    const transition = evaluateInvariantLedgerTransition({ before: pre.snapshot.appliedMigrations, after: post.appliedMigrations, comparisonKind: context.comparisonKind, expectedRange: context.expectedMigrationRange, expectedMigrations: expectedMigrations() });
    assertRepositoryKnownLedger({ repositoryMigrations: repositoryMigrations(), observedMigrations: pre.snapshot.appliedMigrations });
    const beforeLedger = safeLedger(pre.snapshot.appliedMigrations);
    const afterLedger = safeLedger(post.appliedMigrations);
    const { added, removed, observedRange } = transition;
    const ledgerMatches = transition.verdict === "pass";
    const report = { ...comparison, check: "remote-invariant-comparison", commit: context.commit, target: context.target, sourceTarget: pre.target, comparisonKind: context.comparisonKind, migrationRange: observedRange, ledger: { before: beforeLedger.knownMigrations, after: afterLedger.knownMigrations, beforeSha256: beforeLedger.observedSha256, afterSha256: afterLedger.observedSha256, beforeCount: beforeLedger.observedCount, afterCount: afterLedger.observedCount, unknownCount: beforeLedger.unknownCount + afterLedger.unknownCount, status: beforeLedger.status === "known" && afterLedger.status === "known" ? "known" : "drift", added, removed, appliedThrough: afterLedger.appliedThrough, verdict: ledgerMatches ? "pass" : "fail" } };
    if (context.comparisonKind === "recovery") {
      const matches = fullRecoveryStatesEqual(pre.snapshot.fullRecovery, post.fullRecovery);
      report.fullRecovery = { before: pre.snapshot.fullRecovery, after: post.fullRecovery, verdict: matches ? "pass" : "fail" };
      if (!matches) { report.verdict = "fail"; report.failures = [...report.failures, "full recovery catalog or data mismatch"]; }
    }
    if (arg("--sanitized")) {
      if (context.target.environment !== "rehearsal") throw new Error("Public sanitized state digest is restricted to rehearsal.");
      const sourceSha256 = createHash("sha256").update(readFileSync(arg("--sanitized"))).digest("hex");
      verifyLiveIdentity(context.target);
      stage = 'invariant-query';
      const { rows: _rows, ...binding } = captureSanitizedState({ sourceSha256, query: (sql) => wrangler(["d1", "execute", database, "--remote", "--json", "--command", sql]) });
      verifyLiveIdentity(context.target);
      stage = 'invariant-comparison';
      if (binding.ledgerSha256 !== post.ledgerSha256) throw new Error("Remote ledger changed while binding sanitized handlers.");
      report.sanitizedState = binding;
    }
    if (!ledgerMatches) { report.verdict = "fail"; report.failures = [...report.failures, "migration ledger or reviewed range mismatch"]; }
    const summary = `${report.verdict.toUpperCase()} remote invariant comparison commit=${context.commit} environment=${context.target.environment} binding=${context.target.binding} database=${context.target.databaseName} databaseId=${context.target.databaseId} migration=${observedRange.from}->${observedRange.to} ledger=${afterLedger.appliedThrough}.`;
    writeDataCheckReports({ name: "remote-invariant-comparison", report, summary, reportDirectory });
    if (report.verdict !== "pass") process.exitCode = 1;
  }
} catch (error) {
  const failure = safeCanaryFailure(stage, error);
  const safeFailureLedger = failureLedgerProjection ? { applied: failureLedgerProjection.knownMigrations, appliedThrough: failureLedgerProjection.appliedThrough, sha256: failureLedgerProjection.observedSha256, status: failureLedgerProjection.status, observedCount: failureLedgerProjection.observedCount, knownCount: failureLedgerProjection.knownCount, unknownCount: failureLedgerProjection.unknownCount } : null;
  const report = { check: mode === "capture" ? "remote-invariant-capture" : "remote-invariant-comparison", verdict: "fail", ...reportContext, error: failure.message, failedStage: failure.stage, errorCode: failure.code, checks: [{ name: failure.check, verdict: 'fail' }], ...(safeFailureLedger ? { ledger: safeFailureLedger } : {}), ...(failure.exitStatus === undefined ? {} : { exitStatus: failure.exitStatus }) };
  const summary = `BLOCKED remote invariants ${reportIdentitySummary(report)}; stage=${failure.stage}: ${failure.code}. ${failure.message}`;
  try { writeDataCheckReports({ name: report.check, report, summary, reportDirectory }); }
  catch { console.error('Remote invariant failure report could not be persisted.'); }
  console.error(summary); process.exitCode = 1;
}
