// Template field limits and slug rules shared by the template editor
// (src/lib/forms/templateEditorDetailsForm.ts) and the API payload schema
// (functions/api/utils/payloads.ts), so the editor never accepts what the API rejects.

export const TEMPLATE_FIELD_LIMITS = {
  title: 160,
  description: 5000,
  seoTitle: 160,
  seoDescription: 320,
  // Tags and categories: how many, and how long each one may be.
  listItems: 20,
  listItemLength: 80,
  slug: 160,
} as const;

// The name a template is saved with when its name is left blank.
export const DEFAULT_TEMPLATE_TITLE = "Untitled Template";

export const TEMPLATE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TEMPLATE_SLUG_PATTERN_MESSAGE =
  "slug must be lowercase letters, numbers, and hyphens only";

// Cuts a valid slug to the limit without leaving a trailing hyphen.
export function capTemplateSlug(slug: string, max: number = TEMPLATE_FIELD_LIMITS.slug): string {
  return slug.slice(0, max).replace(/-+$/, "");
}

// Turns typed text into a valid slug: accents dropped, lowercase, apostrophes removed,
// every other run of non-alphanumerics one hyphen, no leading or trailing hyphen, capped.
// Returns "" when nothing usable remains (for example "!!!" or non-Latin text).
export function slugifyTemplateSlug(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return capTemplateSlug(slug);
}

// Appends a disambiguating suffix, shortening the base so the result stays within the limit.
export function appendTemplateSlugSuffix(base: string, suffix: string): string {
  const cappedBase = capTemplateSlug(base, TEMPLATE_FIELD_LIMITS.slug - suffix.length - 1);
  return cappedBase ? `${cappedBase}-${suffix}` : suffix;
}
