import { generateSlug, looksLikeTemplateId } from '../../../src/lib/utils/slug';
import { TEMPLATE_SLUG_MAX } from '../../../src/lib/schemas/templateLimits';

export { generateSlug, looksLikeTemplateId };

export function truncateSlug(slug: string, max: number): string {
  return slug.slice(0, max).replace(/-+$/, '');
}

export function withSlugSuffix(base: string, suffix: string, max: number): string {
  const head = truncateSlug(base, max - suffix.length - 1);
  return head ? `${head}-${suffix}` : suffix;
}

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

export function resolveRequestedSlug(requested: string | undefined, storedSlug: unknown): RequestedSlug {
  const value = requested?.trim() ?? '';
  if (!value || value === storedSlug) return { kind: 'unchanged' };

  const normalized = truncateSlug(generateSlug(value), TEMPLATE_SLUG_MAX);
  if (!normalized) return { kind: 'invalid', message: 'slug: Use Latin letters or numbers in the URL slug.' };
  return normalized === storedSlug ? { kind: 'unchanged' } : { kind: 'changed', slug: normalized };
}
