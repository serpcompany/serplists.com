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

export const TEMPLATE_FIELD_LIMITS = {
  title: TEMPLATE_TITLE_MAX,
  description: TEMPLATE_DESCRIPTION_MAX,
  seoTitle: TEMPLATE_SEO_TITLE_MAX,
  seoDescription: TEMPLATE_SEO_DESCRIPTION_MAX,
  tagOrCategoryCount: TEMPLATE_LIST_MAX_ITEMS,
  tagOrCategoryLength: TEMPLATE_LIST_ITEM_MAX,
  slug: TEMPLATE_SLUG_MAX,
} as const;

export const TEMPLATE_TITLE_MAX_LENGTH = TEMPLATE_FIELD_LIMITS.title;

export const DEFAULT_TEMPLATE_TITLE = "Untitled Template";

export const TEMPLATE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const TEMPLATE_SLUG_PATTERN_MESSAGE =
  "slug must be lowercase letters, numbers, and hyphens only";

export function capTemplateSlug(slug: string, max: number = TEMPLATE_FIELD_LIMITS.slug): string {
  return slug.slice(0, max).replace(/-+$/, "");
}

export function slugifyTemplateSlug(input: string): string {
  return capTemplateSlug(generateSlug(input));
}
