export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Cuts a slug to `max` characters without leaving a trailing hyphen. */
export function truncateSlug(slug: string, max: number): string {
  return slug.slice(0, max).replace(/-+$/, '');
}

/**
 * `${base}-${suffix}` within `max` characters. The base is shortened to make room, so a
 * de-duplicated slug still passes the same length check as the slug it replaces.
 */
export function withSlugSuffix(base: string, suffix: string, max: number): string {
  const head = truncateSlug(base, max - suffix.length - 1);
  return head ? `${head}-${suffix}` : suffix;
}
