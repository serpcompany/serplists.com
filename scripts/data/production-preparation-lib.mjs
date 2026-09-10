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
// One ordered definition drives preparation, execution, and evidence validation.
export const PRODUCTION_STEPS = {
  "identity": { preparation: true, execution: true, validate(summary, payload, step) {
      if (summary.databaseName !== payload.database.databaseName || summary.databaseId !== payload.database.databaseId) throw new Error("Signed production identity summary does not match the target database.");
  } },
  "recovery-bookmark": { preparation: true, execution: false, validate(summary, payload, step) {
      if (summary.captured !== true || typeof summary.bookmark !== "string" || !summary.bookmark.trim()) throw new Error("Signed production recovery bookmark summary is incomplete.");
  } },
  "recovery-export": { preparation: true, execution: false, validate(summary, payload, step) {
      if (!hasSha256(summary.encryptedBackupSha256) || !Number.isInteger(summary.encryptedBackupByteLength) || summary.encryptedBackupByteLength <= 0) throw new Error("Signed production recovery export summary lacks a nonempty encrypted artifact digest and size.");
  } },
  "reviewed-pending-range": { preparation: true, execution: true, validate(summary, payload, step) {
      if (!Array.isArray(summary.pendingMigrations) || JSON.stringify(summary.pendingMigrations) !== JSON.stringify(payload.pendingMigrations) ||
          summary.from !== payload.migrationRange.from || summary.to !== payload.migrationRange.to) throw new Error("Signed production pending-range summary does not match the reviewed request.");
  } },
  "pre-invariants": { preparation: true, execution: true, validate(summary, payload, step) {
      assertInvariantSafetySummary({ step, summary, pendingMigrations: payload.pendingMigrations });
      if (!Number.isInteger(summary.invariantCount) || summary.invariantCount <= 0 || !summary.appliedThrough || !hasSha256(summary.ledgerSha256) || !hasSha256(summary.domainDigest)) throw new Error("Signed production pre-invariant ledger summary is incomplete.");
  } },
  "source-schema": { preparation: true, execution: true, validate(summary, payload, step) {
      assertSourceSchemaProof(summary, { ...payload.results['pre-invariants'].summary, commit: payload.commit, database: payload.database, pendingMigrations: payload.pendingMigrations });
  } },
  "migration-apply": { preparation: false, execution: true, validate(summary, payload, step) {
      if (!Array.isArray(summary.appliedMigrations) || JSON.stringify(summary.appliedMigrations) !== JSON.stringify(payload.pendingMigrations)) throw new Error("Signed production migration-apply summary does not match the reviewed pending range.");
  } },
  "ledger-clean": { preparation: false, execution: true, validate(summary, payload, step) {
      if (!Array.isArray(summary.pendingMigrations) || summary.pendingMigrations.length !== 0 || !summary.appliedThrough) throw new Error("Signed production ledger summary is incomplete or not clean.");
  } },
  "schema-contract": { preparation: false, execution: true, validate(summary, payload, step) {
      if (summary.verdict !== "pass" || !summary.appliedThrough || !hasSha256(summary.schemaDigest)) throw new Error("Signed production schema-contract summary is incomplete.");
  } },
  "post-invariants": { preparation: false, execution: true, validate(summary, payload, step) {
      assertInvariantSafetySummary({ step, summary, pendingMigrations: payload.pendingMigrations });
      if (!Number.isInteger(summary.invariantCount) || summary.invariantCount <= 0 || summary.failureCount !== 0 || !hasSha256(summary.preDomainDigest) || !hasSha256(summary.postDomainDigest)) throw new Error("Signed production post-invariant summary is incomplete or failed.");
  } },
};
export const REQUIRED_PRODUCTION_STEPS = Object.keys(PRODUCTION_STEPS);
export const PREPARATION_STEPS = REQUIRED_PRODUCTION_STEPS.filter(step => PRODUCTION_STEPS[step].preparation);
export const EXECUTION_STEPS = REQUIRED_PRODUCTION_STEPS.filter(step => PRODUCTION_STEPS[step].execution);
export const IDENTITY_BOUND_STEPS = new Set(REQUIRED_PRODUCTION_STEPS.filter(step => step !== 'identity'));
export function hasSha256(value) { return /^[0-9a-f]{64}$/.test(value ?? ''); }
export function assertProductionStepSummary({ step, summary, payload }) {
  if (summary?.type !== step) throw new Error(`Signed production ${step} evidence lacks a typed summary.`);
  const definition = PRODUCTION_STEPS[step];
  if (!definition) throw new Error(`Unknown signed production summary ${step}.`);
  definition.validate(summary, payload, step);
}


export function prepareProduction({ request, context, run, clock = Date.now }) {
  const now = new Date(clock()).toISOString();
  const results = {};
  for (const step of PREPARATION_STEPS) {
    try { results[step] = run(step); } catch (error) { throw wrapCanarySubprocessFailure(`production-${step}`, error); }
    if (results[step]?.verdict !== "pass") throw new Error(`Production preparation ${step} failed.`);
    assertProductionStepSummary({ step, summary: results[step].summary, payload: { ...request, results } });
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
  for (const step of PREPARATION_STEPS) assertProductionStepSummary({ step, summary: preparation.results[step].summary, payload: { ...request, results: preparation.results } });
  const result = (step) => preparation.results[step].summary;
  assertInvariantSafetySummary({ step: 'pre-invariants', summary: result('pre-invariants'), pendingMigrations: request.pendingMigrations });
  assertRepositoryAppliedPrefix({ ...result('pre-invariants'), pendingMigrations: request.pendingMigrations });
  assertSourceSchemaProof(result('source-schema'), { ...result('pre-invariants'), commit: request.commit, database: request.database, pendingMigrations: request.pendingMigrations });
  if (!encrypted?.length || digest(encrypted) !== result("recovery-export")?.encryptedBackupSha256 || encrypted.length !== result("recovery-export")?.encryptedBackupByteLength) throw new Error("Durable encrypted export digest mismatch.");
  return { artifactId: String(artifactId), preparationSha256: expectedDigest, requestSha256: digest(request), runId: context.runId, runAttempt: context.runAttempt };
}

export function approvalToken(receipt) {
  return `recovery:${receipt.runId}:${receipt.runAttempt}:${receipt.artifactId}:${receipt.preparationSha256}`;
}

export function assertRecoveryApproval({ approval, receipt }) {
  const token = approvalToken(receipt);
  if (!receipt || JSON.stringify(approval?.recovery) !== JSON.stringify(receipt) || approval?.recoveryTokenSha256 !== digest(token)) throw new Error("Fresh approval must name the exact verified durable recovery request.");
}
