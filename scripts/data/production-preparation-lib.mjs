import { createHash } from "node:crypto";

export const digest = (value) => createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
export const PREPARATION_STEPS = ["identity", "recovery-bookmark", "recovery-export", "reviewed-pending-range", "pre-invariants"];

export function prepareProduction({ request, context, run, now = new Date().toISOString() }) {
  const results = {};
  for (const step of PREPARATION_STEPS) {
    results[step] = run(step);
    if (results[step]?.verdict !== "pass") throw new Error(`Production preparation ${step} failed.`);
  }
  return { version: 1, requestSha256: digest(request), context, preparedAt: now, results };
}

export function verifyRecoveryBundle({ request, preparation, encrypted, expectedDigest, artifactId, context }) {
  if (!/^[1-9][0-9]*$/.test(String(artifactId ?? "")) || !/^[a-f0-9]{64}$/.test(expectedDigest ?? "") || digest(preparation) !== expectedDigest || preparation.requestSha256 !== digest(request)) throw new Error("Durable recovery request/artifact digest mismatch.");
  for (const key of ["repository", "runId", "runAttempt", "commit"]) {
    if (!context?.[key] || preparation.context?.[key] !== context[key]) throw new Error("Recovery preparation belongs to another run, attempt, or commit.");
  }
  if (JSON.stringify(Object.keys(preparation.results ?? {})) !== JSON.stringify(PREPARATION_STEPS) || PREPARATION_STEPS.some(step => preparation.results[step]?.verdict !== "pass")) throw new Error("Recovery preparation is incomplete.");
  const result = (step) => preparation.results[step].summary;
  if (result("identity")?.databaseId !== request.database.databaseId || result("identity")?.databaseName !== request.database.databaseName || !result("recovery-bookmark")?.bookmark) throw new Error("Recovery identity or bookmark is missing.");
  if (!encrypted?.length || digest(encrypted) !== result("recovery-export")?.encryptedBackupSha256 || encrypted.length !== result("recovery-export")?.encryptedBackupByteLength) throw new Error("Durable encrypted export digest mismatch.");
  if (JSON.stringify(result("reviewed-pending-range")?.pendingMigrations) !== JSON.stringify(request.pendingMigrations) || !/^[a-f0-9]{64}$/.test(result("pre-invariants")?.ledgerSha256 ?? "")) throw new Error("Recovery pending range or ledger is invalid.");
  return { artifactId: String(artifactId), preparationSha256: expectedDigest, requestSha256: digest(request), runId: context.runId, runAttempt: context.runAttempt };
}

export function approvalToken(receipt) {
  return `recovery:${receipt.runId}:${receipt.runAttempt}:${receipt.artifactId}:${receipt.preparationSha256}`;
}

export function assertRecoveryApproval({ approval, receipt }) {
  if (!receipt || JSON.stringify(approval?.recovery) !== JSON.stringify(receipt) || !approval?.decision?.includes(approvalToken(receipt))) throw new Error("Fresh approval must name the exact verified durable recovery request.");
}
