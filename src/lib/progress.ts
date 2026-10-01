export function toProgressPercent(completed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(completed) || completed <= 0) return 0;
  if (completed >= total) return 100;
  return Math.min(99, Math.max(1, Math.round((completed / total) * 100)));
}
