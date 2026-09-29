// Template field limits and slug rules shared by the template editor
// (src/lib/forms/templateEditorDetailsForm.ts) and the API payload schema
// (functions/api/utils/payloads.ts), so the editor never accepts what the API rejects.

import { generateSlug } from "../utils/slug";
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

// Turns typed text into a valid slug with the one slug rule the API applies
// (src/lib/utils/slug.ts): letters folded ('Straße' -> 'strasse'), punctuation dropped
// ('Q&A' -> 'qa'), words joined by single hyphens, capped. A valid slug comes back
// unchanged. Returns "" when nothing usable remains (for example "!!!" or non-Latin text).
export function slugifyTemplateSlug(input: string): string {
  return capTemplateSlug(generateSlug(input));
}

// Appends a disambiguating suffix, shortening the base so the result stays within the limit.
export function appendTemplateSlugSuffix(base: string, suffix: string): string {
  const cappedBase = capTemplateSlug(base, TEMPLATE_FIELD_LIMITS.slug - suffix.length - 1);
  return cappedBase ? `${cappedBase}-${suffix}` : suffix;
}
