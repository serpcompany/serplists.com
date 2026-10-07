export const DAY = 24 * 60 * 60 * 1000;
export const HOUR = 60 * 60 * 1000;

export function sqliteTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

export type SeedClock = { now: Date; at: (offset: number) => string };

export function seedClock(): SeedClock {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const nowMs = now.getTime();
  const at = (offset: number) => sqliteTime(new Date(nowMs + offset));
  return { now, at };
}
