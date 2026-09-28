// Template field limits and slug rules shared by the template editor
// (src/lib/forms/templateEditorDetailsForm.ts) and the API payload schema
// (functions/api/utils/payloads.ts), so the editor never accepts what the API rejects.

import {
  TEMPLATE_DESCRIPTION_MAX,
  TEMPLATE_LIST_ITEM_MAX,
  TEMPLATE_LIST_MAX_ITEMS,
  TEMPLATE_SEO_DESCRIPTION_MAX,
  TEMPLATE_SEO_TITLE_MAX,
  TEMPLATE_SLUG_MAX,
  TEMPLATE_TITLE_MAX,
} from "./templateLimits";

// The numbers live in ./templateLimits.ts with the other limits every write path enforces.
export const TEMPLATE_FIELD_LIMITS = {
  title: TEMPLATE_TITLE_MAX,
  description: TEMPLATE_DESCRIPTION_MAX,
  seoTitle: TEMPLATE_SEO_TITLE_MAX,
  seoDescription: TEMPLATE_SEO_DESCRIPTION_MAX,
  // Tags and categories: how many, and how long each one may be.
  listItems: TEMPLATE_LIST_MAX_ITEMS,
  listItemLength: TEMPLATE_LIST_ITEM_MAX,
  slug: TEMPLATE_SLUG_MAX,
} as const;

// The longest title the API accepts. Titles the app builds itself (such as a duplicate's
// '<title> Copy') are shortened to fit it.
export const TEMPLATE_TITLE_MAX_LENGTH = TEMPLATE_FIELD_LIMITS.title;

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
