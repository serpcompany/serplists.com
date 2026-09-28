import { generateSlug } from '../../../src/lib/utils/slug';
import { TEMPLATE_SLUG_MAX } from '../../../src/lib/schemas/templateLimits';

// The slug rule itself is shared with the page and the sitemap, so their URLs match.
export { generateSlug };

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

/** The slug in /api/templates/slug/<encoded slug>, or null when its encoding is malformed. */
export function decodeSlugPath(segments: string[]): string | null {
  try {
    return decodeURIComponent(segments.join('/'));
  } catch {
    return null;
  }
}

type RequestedSlug =
  | { kind: 'unchanged' }
  | { kind: 'changed'; slug: string }
  | { kind: 'invalid'; message: string };

/**
 * What a template update asks for its slug. An empty or echoed stored slug is left
 * alone, even a legacy one today's rule rejects (rows backfilled by migrations 0002 and
 * 0005), so unrelated saves never fail or rewrite shared URLs. A new slug is normalized
 * to a valid one rather than rejected; one with no letters or digits to keep ('Список')
 * is an error, not silently ignored.
 */
export function resolveRequestedSlug(requested: string | undefined, storedSlug: unknown): RequestedSlug {
  const value = requested?.trim() ?? '';
  if (!value || value === storedSlug) return { kind: 'unchanged' };

  const normalized = truncateSlug(generateSlug(value), TEMPLATE_SLUG_MAX);
  if (!normalized) return { kind: 'invalid', message: 'slug: Use Latin letters or numbers in the URL slug.' };
  return normalized === storedSlug ? { kind: 'unchanged' } : { kind: 'changed', slug: normalized };
}
