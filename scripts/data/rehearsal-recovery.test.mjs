import { describe, expect, it } from "vitest";
import { validateRehearsalRecoveryEvidence } from "./rehearsal-recovery-lib.mjs";

const sourceDatabaseId = "11111111-1111-4111-8111-111111111111";
const recoveryDatabaseId = "22222222-2222-4222-8222-222222222222";
const evidence = {
  verdict: "pass",
  commit: "0123456789abcdef0123456789abcdef01234567",
  environment: "rehearsal",
  sourceDatabase: { name: "rehearsal-source", id: sourceDatabaseId },
  recoveryDatabase: { name: "rehearsal-restore", id: recoveryDatabaseId },
  migration: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql", appliedThrough: "0024_safe_template_evolution.sql", ledgerSha256: "b".repeat(64) },
  sanitizer: { version: "source-derived-shape-v4", artifactSha256: "a".repeat(64), manifestIntegritySha256: "c".repeat(64), sourceProfile: { profile: "legacy-template-evolution-v1", migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, sourceSchema: "0023_add_sitemap_revision_state.sql" } },
  creation: { verdict: "pass", runId: "123", sourceEvidenceSha256: "e".repeat(64), recoveryEvidenceSha256: "f".repeat(64) },
  import: { verdict: "pass" },
  invariants: { verdict: "pass", evidenceSha256: "c".repeat(64), domainDigest: "d".repeat(64) },
  absence: { verdict: "pass" },
  rawPlaintextRetained: false,
};

describe("remote recovery rehearsal evidence", () => {
  it("requires a separate restored database with matching invariants and confirmed absence", () => {
    expect(validateRehearsalRecoveryEvidence({ evidence, sourceDatabaseId, recoveryDatabaseId })).toEqual(evidence);
    for (const invalid of [
      { ...evidence, import: { verdict: "fail" } },
      { ...evidence, invariants: { verdict: "fail" } },
      { ...evidence, absence: { verdict: "fail" } },
      { ...evidence, rawPlaintextRetained: true },
      { ...evidence, sanitizer: { ...evidence.sanitizer, sourceProfile: { ...evidence.sanitizer.sourceProfile, profile: "current-template-run-v1" } } },
    ]) expect(() => validateRehearsalRecoveryEvidence({ evidence: invalid, sourceDatabaseId, recoveryDatabaseId })).toThrow();
    expect(() => validateRehearsalRecoveryEvidence({ evidence, sourceDatabaseId, recoveryDatabaseId: sourceDatabaseId })).toThrow(/separate/i);
    expect(() => validateRehearsalRecoveryEvidence({ evidence, sourceDatabaseId, recoveryDatabaseId, expectedCommit: "f".repeat(40) })).toThrow();
    expect(() => validateRehearsalRecoveryEvidence({ evidence: { ...evidence, migration: { from: "0023", to: "0023" } }, sourceDatabaseId, recoveryDatabaseId, expectedMigrationFrom: "0024_safe_template_evolution.sql" })).toThrow();
  });
});
