import { describe, expect, it } from "vitest";
import { evaluateInvariantLedgerTransition, validatePreInvariantEvidence, validateRemoteInvariantContext } from "./remote-invariant-evidence-lib.mjs";
const commit = "a".repeat(40); const sourceId = "11111111-1111-4111-8111-111111111111"; const recoveryId = "22222222-2222-4222-8222-222222222222"; const migration = "0024_safe_template_evolution.sql";
const context = { commit, target: { environment: "rehearsal", binding: "DB", databaseName: "source-db", databaseId: sourceId }, expectedMigrationRange: { from: migration, to: migration }, comparisonKind: "migration" };
describe("remote invariant evidence binding", () => {
  it("rejects missing identity and commit context", () => { expect(validateRemoteInvariantContext(context)).toEqual(context); for (const invalid of [{ ...context, commit: null }, { ...context, target: { ...context.target, databaseId: null } }, { ...context, expectedMigrationRange: { from: migration, to: null } }]) expect(() => validateRemoteInvariantContext(invalid)).toThrow(); });
  it("rejects cross-commit, cross-database migration evidence and same-database recovery", () => { const pre = { schemaVersion: 1, verdict: "pass", commit, target: context.target, snapshot: {} }; expect(validatePreInvariantEvidence({ pre, context })).toEqual(pre); expect(() => validatePreInvariantEvidence({ pre, context: { ...context, commit: "b".repeat(40) } })).toThrow(); expect(() => validatePreInvariantEvidence({ pre, context: { ...context, target: { ...context.target, databaseId: recoveryId } } })).toThrow(); expect(() => validatePreInvariantEvidence({ pre, context: { ...context, comparisonKind: "recovery" } })).toThrow(/separate/i); });
  it("requires exact ordered append, exact recovery equality, and no additions for none/none", () => {
    const options = { before: ["0023_previous.sql"], comparisonKind: "migration", expectedRange: { from: migration, to: migration }, expectedMigrations: [migration] };
    expect(evaluateInvariantLedgerTransition({ ...options, after: ["0023_previous.sql", migration] }).verdict).toBe("pass");
    for (const after of [[migration, "0023_previous.sql"], ["0023_previous.sql", "0025_wrong.sql"], ["0023_previous.sql", migration, "0025_wrong.sql"]]) expect(evaluateInvariantLedgerTransition({ ...options, after }).verdict).toBe("fail");
    expect(evaluateInvariantLedgerTransition({ before: [migration], after: [migration], comparisonKind: "recovery", expectedRange: { from: migration, to: migration } }).verdict).toBe("pass");
    expect(evaluateInvariantLedgerTransition({ before: [migration], after: [migration, "0025_wrong.sql"], comparisonKind: "recovery", expectedRange: { from: migration, to: migration } }).verdict).toBe("fail");
    expect(evaluateInvariantLedgerTransition({ before: [migration], after: [migration, "0025_wrong.sql"], comparisonKind: "migration", expectedRange: { from: null, to: null }, expectedMigrations: [] }).verdict).toBe("fail");
  });
});
