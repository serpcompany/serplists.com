const GIT_SHA = /^[0-9a-f]{40}$/;

export function validateRehearsalRecoveryEvidence({ evidence, sourceDatabaseId, recoveryDatabaseId, expectedCommit, expectedEnvironment = "rehearsal", expectedMigrationFrom, expectedMigrationTo, expectedSanitizerVersion }) {
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
    (expectedMigrationFrom && evidence.migration?.from !== expectedMigrationFrom) ||
    (expectedMigrationTo && evidence.migration?.to !== expectedMigrationTo) ||
    (expectedSanitizerVersion && evidence.sanitizer?.version !== expectedSanitizerVersion) ||
    !evidence.sourceDatabase?.name || !evidence.recoveryDatabase?.name ||
    !evidence.migration?.from || !evidence.migration?.to || !evidence.sanitizer?.version || !evidence.sanitizer?.artifactSha256 ||
    evidence.import?.verdict !== "pass" ||
    evidence.invariants?.verdict !== "pass" ||
    evidence.absence?.verdict !== "pass" ||
    evidence.rawPlaintextRetained !== false
  ) {
    throw new Error("Recovery evidence must prove restore/import, matching invariants, absence, and plaintext deletion.");
  }
  return evidence;
}
