const MIGRATION = /^\d{4}_[a-z0-9_]+\.sql$/;

// CLI `none` is accepted only at this boundary; evidence uses explicit nulls.
// Undefined endpoints are missing evidence, not an application-only request.
export function normalizeMigrationRange(range) {
  if (!range || range.from === undefined || range.to === undefined) throw new Error("Migration range is missing or incomplete.");
  const from = range.from === "none" ? null : range.from;
  const to = range.to === "none" ? null : range.to;
  if ((from === null) !== (to === null) || (from !== null && (typeof from !== "string" || typeof to !== "string" || !MIGRATION.test(from) || !MIGRATION.test(to) || from > to))) throw new Error("Migration range is incomplete or invalid.");
  return { from, to };
}

export function migrationRangesEqual(left, right) {
  return JSON.stringify(normalizeMigrationRange(left)) === JSON.stringify(normalizeMigrationRange(right));
}

// Failed reports must retain a visibly invalid range instead of inventing none.
export function migrationRangeForReport(range) {
  try { return normalizeMigrationRange(range); }
  catch { return { from: "invalid", to: "invalid" }; }
}

export function migrationsInRange(files, value) {
  const range = normalizeMigrationRange(value);
  if (range.from === null) return [];
  const start = files.indexOf(range.from); const end = files.indexOf(range.to);
  if (start < 0 || end < start) throw new Error("Reviewed migration range is not a contiguous repository range.");
  return files.slice(start, end + 1);
}

export function rangeFromPending(files, pending) {
  if (!Array.isArray(pending)) throw new Error("Pending migration ledger is missing.");
  const range = normalizeMigrationRange({ from: pending[0] ?? null, to: pending.at(-1) ?? null });
  if (JSON.stringify(migrationsInRange(files, range)) !== JSON.stringify(pending) || (pending.length && range.to !== files.at(-1))) throw new Error("Pending migrations are unknown, skipped, reordered, or not the complete repository suffix.");
  return range;
}
