import { normalizeMigrationRange } from "./migration-range-lib.mjs";
export function validateRemoteInvariantContext(value) {
  if (!/^[0-9a-f]{40}$/.test(value.commit ?? "") || !["local", "staging", "rehearsal", "production"].includes(value.target?.environment) || value.target?.binding !== "DB" || !value.target?.databaseName || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.target?.databaseId ?? "") || !["migration", "recovery"].includes(value.comparisonKind)) throw new Error("Remote invariant evidence context is missing or invalid.");
  value.expectedMigrationRange = normalizeMigrationRange(value.expectedMigrationRange);
  return value;
}

export function validatePreInvariantEvidence({ pre, context }) {
  if (pre?.schemaVersion !== 1 || pre?.verdict !== "pass" || !pre.snapshot || pre.commit !== context.commit || pre.target?.environment !== context.target.environment || pre.target?.binding !== context.target.binding) throw new Error("Pre-invariant evidence identity or commit does not match this comparison.");
  if (context.comparisonKind === "migration" && (pre.target.databaseName !== context.target.databaseName || pre.target.databaseId !== context.target.databaseId)) throw new Error("Migration invariant comparison cannot change database identity.");
  if (context.comparisonKind === "recovery" && (pre.target.databaseId === context.target.databaseId || pre.target.databaseName === context.target.databaseName)) throw new Error("Recovery invariant comparison requires a separate database identity.");
  return pre;
}

export function evaluateInvariantLedgerTransition({ before, after, comparisonKind, expectedRange, expectedMigrations = [] }) {
  expectedRange = normalizeMigrationRange(expectedRange);
  const added = after.slice(before.length);
  const removed = before.filter((name, index) => after[index] !== name);
  const observedRange = comparisonKind === "migration" && added.length ? { from: added[0], to: added.at(-1) } : expectedRange;
  const exactRecovery = JSON.stringify(after) === JSON.stringify(before);
  const exactMigration = expectedRange.from == null
    ? exactRecovery && expectedMigrations.length === 0
    : JSON.stringify(after) === JSON.stringify([...before, ...expectedMigrations]) && expectedMigrations[0] === expectedRange.from && expectedMigrations.at(-1) === expectedRange.to;
  return { added, removed, observedRange, verdict: (comparisonKind === "recovery" ? exactRecovery : exactMigration) ? "pass" : "fail" };
}
