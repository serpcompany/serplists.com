// Counts in UI copy: "1 template", "2 templates", "0 tasks". Every count the app shows goes
// through these, so none reads "1 templates" (TD-24).

/** The noun for a count: the singular for exactly 1, else the plural (the singular plus "s"). */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/** A count and its noun: `formatCount(1, 'section')` is "1 section". */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`;
}
