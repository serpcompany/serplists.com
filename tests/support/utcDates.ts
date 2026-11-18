const DAY_MS = 86_400_000;

export const utcDate = (at: Date = new Date()) => at.toISOString().slice(0, 10);

export const theUtcDayAfter = (date: string) => utcDate(new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS));

export async function withTheDatesAround<T>(run: () => T | Promise<T>): Promise<{ result: T; dates: string[] }> {
  const before = utcDate();
  const result = await run();
  return { result, dates: [before, utcDate()] };
}
