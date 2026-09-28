import { templateSlugSchema } from './payloads';

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
 * alone, even a legacy one the current rule rejects, so unrelated saves never fail
 * or rewrite shared URLs. A new slug must pass templateSlugSchema.
 */
export function resolveRequestedSlug(requested: string | undefined, storedSlug: unknown): RequestedSlug {
  const value = requested?.trim() ?? '';
  if (!value || value === storedSlug) return { kind: 'unchanged' };

  const parsed = templateSlugSchema.safeParse(value);
  return parsed.success
    ? { kind: 'changed', slug: parsed.data }
    : { kind: 'invalid', message: parsed.error.issues[0]?.message ?? 'Invalid slug' };
}
