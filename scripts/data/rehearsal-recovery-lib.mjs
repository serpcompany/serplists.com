export function validateRehearsalRecoveryEvidence({ evidence, sourceDatabaseId, recoveryDatabaseId }) {
  if (!sourceDatabaseId || !recoveryDatabaseId || sourceDatabaseId === recoveryDatabaseId) {
    throw new Error("Recovery rehearsal requires separate source and restore database identities.");
  }
  if (
    evidence?.verdict !== "pass" ||
    evidence.sourceDatabaseId !== sourceDatabaseId ||
    evidence.recoveryDatabaseId !== recoveryDatabaseId ||
    evidence.import?.verdict !== "pass" ||
    evidence.invariants?.verdict !== "pass" ||
    evidence.absence?.verdict !== "pass" ||
    evidence.rawPlaintextRetained !== false
  ) {
    throw new Error("Recovery evidence must prove restore/import, matching invariants, absence, and plaintext deletion.");
  }
  return evidence;
}
