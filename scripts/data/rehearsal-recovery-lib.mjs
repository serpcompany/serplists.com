import { normalizeMigrationRange, migrationRangesEqual } from "./migration-range-lib.mjs";
const GIT_SHA = /^[0-9a-f]{40}$/;

export function validateRehearsalRecoveryEvidence({ evidence, sourceDatabaseId, recoveryDatabaseId, expectedCommit, expectedEnvironment = "rehearsal", expectedMigrationFrom, expectedMigrationTo, expectedSanitizerVersion }) {
  const range = normalizeMigrationRange(evidence?.migration);
  const expectedRange = expectedMigrationFrom !== undefined || expectedMigrationTo !== undefined
    ? normalizeMigrationRange({ from: expectedMigrationFrom, to: expectedMigrationTo }) : range;
  if (!sourceDatabaseId || !recoveryDatabaseId || sourceDatabaseId === recoveryDatabaseId) {
    throw new Error("Recovery rehearsal requires separate source and restore database identities.");
  }
  if (
    evidence?.verdict !== "pass" ||
    evidence.commit == null || !GIT_SHA.test(evidence.commit) ||
    evidence.environment !== expectedEnvironment ||
    evidence.sourceDatabase?.id !== sourceDatabaseId ||
    evidence.recoveryDatabase?.id !== recoveryDatabaseId ||
    (expectedCommit && evidence.commit !== expectedCommit) ||
    !migrationRangesEqual(range, expectedRange) ||
    (expectedSanitizerVersion && evidence.sanitizer?.version !== expectedSanitizerVersion) ||
    !evidence.sourceDatabase?.name || !evidence.recoveryDatabase?.name ||
    !evidence.migration?.appliedThrough || !/^[0-9a-f]{64}$/.test(evidence.migration?.ledgerSha256 ?? "") || !evidence.sanitizer?.version || !/^[0-9a-f]{64}$/.test(evidence.sanitizer?.artifactSha256 ?? "") ||
    evidence.creation?.verdict !== "pass" || !/^\d+$/.test(evidence.creation?.runId ?? "") || !/^[0-9a-f]{64}$/.test(evidence.creation?.sourceEvidenceSha256 ?? "") || !/^[0-9a-f]{64}$/.test(evidence.creation?.recoveryEvidenceSha256 ?? "") ||
    evidence.import?.verdict !== "pass" ||
    evidence.invariants?.verdict !== "pass" || !/^[0-9a-f]{64}$/.test(evidence.invariants?.evidenceSha256 ?? "") || !/^[0-9a-f]{64}$/.test(evidence.invariants?.domainDigest ?? "") ||
    evidence.absence?.verdict !== "pass" ||
    evidence.rawPlaintextRetained !== false
  ) {
    throw new Error("Recovery evidence must prove restore/import, matching invariants, absence, and plaintext deletion.");
  }
  return { ...evidence, migration: { ...evidence.migration, ...range } };
}
