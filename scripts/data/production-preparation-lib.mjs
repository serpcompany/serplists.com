import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { wrapCanarySubprocessFailure } from './canary-diagnostics.mjs';
import { assertSourceSchemaProof } from './source-schema-proof.mjs';
import { assertInvariantSafetySummary } from './invariant-capture-lib.mjs';

export const RECOVERY_MAX_AGE_MS = 15 * 60 * 1000;
export const repositoryMigrationHistory = () => readdirSync(new URL('../../db/migrations/', import.meta.url)).filter(name => /^\d{4}_.*\.sql$/.test(name)).sort();

export function assertRecoveryFreshness(preparation, clock = Date.now) {
  const value = preparation?.preparedAt;
  const timestamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ? Date.parse(value) : NaN;
  const now = clock();
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value || !Number.isFinite(now) || timestamp > now || now - timestamp >= RECOVERY_MAX_AGE_MS) {
    throw wrapCanarySubprocessFailure('production-recovery-freshness', null);
  }
}

export function assertRepositoryAppliedPrefix({ appliedMigrations, pendingMigrations, ledgerSha256 }, repositoryMigrations = repositoryMigrationHistory()) {
  if (!Array.isArray(appliedMigrations) || !Array.isArray(pendingMigrations) ||
      new Set(repositoryMigrations).size !== repositoryMigrations.length ||
      JSON.stringify([...appliedMigrations, ...pendingMigrations]) !== JSON.stringify(repositoryMigrations) ||
      ledgerSha256 !== digest(appliedMigrations)) {
    throw new Error('Production applied ledger plus reviewed pending range must equal complete repository history.');
  }
}

export const digest = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
export const PREPARATION_STEPS = ["identity", "recovery-bookmark", "recovery-export", "reviewed-pending-range", "pre-invariants", "source-schema"];

export function prepareProduction({ request, context, run, clock = Date.now }) {
  const now = new Date(clock()).toISOString();
  const results = {};
  for (const step of PREPARATION_STEPS) {
    try { results[step] = run(step); } catch (error) { throw wrapCanarySubprocessFailure(`production-${step}`, error); }
    if (results[step]?.verdict !== "pass") throw new Error(`Production preparation ${step} failed.`);
  }
  assertRepositoryAppliedPrefix({ ...results['pre-invariants'].summary, pendingMigrations: request.pendingMigrations });
  assertInvariantSafetySummary({ step: 'pre-invariants', summary: results['pre-invariants'].summary, pendingMigrations: request.pendingMigrations });
  assertSourceSchemaProof(results['source-schema'].summary, { ...results['pre-invariants'].summary, commit: request.commit, database: request.database, pendingMigrations: request.pendingMigrations });
  assertRecoveryFreshness({ preparedAt: now }, clock);
  return { version: 1, requestSha256: digest(request), context, preparedAt: now, results };
}

export function verifyRecoveryBundle({ request, preparation, encrypted, expectedDigest, artifactId, context, clock = Date.now }) {
  assertRecoveryFreshness(preparation, clock);
  if (!/^[1-9][0-9]*$/.test(String(artifactId ?? "")) || !/^[a-f0-9]{64}$/.test(expectedDigest ?? "") || digest(preparation) !== expectedDigest || preparation.requestSha256 !== digest(request)) throw new Error("Durable recovery request/artifact digest mismatch.");
  for (const key of ["repository", "runId", "runAttempt", "commit"]) {
    if (!context?.[key] || preparation.context?.[key] !== context[key]) throw new Error("Recovery preparation belongs to another run, attempt, or commit.");
  }
  if (JSON.stringify(Object.keys(preparation.results ?? {})) !== JSON.stringify(PREPARATION_STEPS) || PREPARATION_STEPS.some(step => preparation.results[step]?.verdict !== "pass")) throw new Error("Recovery preparation is incomplete.");
  const result = (step) => preparation.results[step].summary;
  assertInvariantSafetySummary({ step: 'pre-invariants', summary: result('pre-invariants'), pendingMigrations: request.pendingMigrations });
  assertRepositoryAppliedPrefix({ ...result('pre-invariants'), pendingMigrations: request.pendingMigrations });
  assertSourceSchemaProof(result('source-schema'), { ...result('pre-invariants'), commit: request.commit, database: request.database, pendingMigrations: request.pendingMigrations });
  if (result("identity")?.databaseId !== request.database.databaseId || result("identity")?.databaseName !== request.database.databaseName || !result("recovery-bookmark")?.bookmark) throw new Error("Recovery identity or bookmark is missing.");
  if (!encrypted?.length || digest(encrypted) !== result("recovery-export")?.encryptedBackupSha256 || encrypted.length !== result("recovery-export")?.encryptedBackupByteLength) throw new Error("Durable encrypted export digest mismatch.");
  if (JSON.stringify(result("reviewed-pending-range")?.pendingMigrations) !== JSON.stringify(request.pendingMigrations) || !/^[a-f0-9]{64}$/.test(result("pre-invariants")?.ledgerSha256 ?? "")) throw new Error("Recovery pending range or ledger is invalid.");
  return { artifactId: String(artifactId), preparationSha256: expectedDigest, requestSha256: digest(request), runId: context.runId, runAttempt: context.runAttempt };
}

export function approvalToken(receipt) {
  return `recovery:${receipt.runId}:${receipt.runAttempt}:${receipt.artifactId}:${receipt.preparationSha256}`;
}

export function assertRecoveryApproval({ approval, receipt }) {
  const token = approvalToken(receipt);
  if (!receipt || JSON.stringify(approval?.recovery) !== JSON.stringify(receipt) || approval?.recoveryTokenSha256 !== digest(token)) throw new Error("Fresh approval must name the exact verified durable recovery request.");
}
