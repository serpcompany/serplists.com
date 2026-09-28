// Run progress as a whole percentage, shared by the app and the API
// (functions/api/utils/template-reconciliation.ts), so the progress a client saves and the
// progress the server computes for the same run agree. Keep it framework-free: it is in
// SHARED_FROM_SRC in .dependency-cruiser.cjs.
//
// Plain rounding showed 100% with work left (199 of 200 is 99.5%) and 0% after work was done
// (1 of 201). So 100 means everything is done, 0 means nothing is, and anything in between
// rounds normally but stays within 1..99.
export function toProgressPercent(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(completed) || completed <= 0) return 0;
  if (completed >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((completed / total) * 100)));
}
