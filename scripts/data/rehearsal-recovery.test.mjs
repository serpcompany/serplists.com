import { describe, expect, it } from "vitest";
import { validateRehearsalRecoveryEvidence } from "./rehearsal-recovery-lib.mjs";

const sourceDatabaseId = "11111111-1111-4111-8111-111111111111";
const recoveryDatabaseId = "22222222-2222-4222-8222-222222222222";
const evidence = {
  verdict: "pass",
  sourceDatabaseId,
  recoveryDatabaseId,
  import: { verdict: "pass" },
  invariants: { verdict: "pass" },
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
    ]) expect(() => validateRehearsalRecoveryEvidence({ evidence: invalid, sourceDatabaseId, recoveryDatabaseId })).toThrow();
    expect(() => validateRehearsalRecoveryEvidence({ evidence, sourceDatabaseId, recoveryDatabaseId: sourceDatabaseId })).toThrow(/separate/i);
  });
});
