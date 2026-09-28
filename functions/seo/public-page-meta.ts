import { z } from 'zod';

import { PUBLIC_CATEGORY_REGISTRY } from '../../src/data/publicCategories';
import { categorySlug } from '../../src/lib/categorySlug';
import {
  CATEGORY_INDEX_PAGE_TEXT,
  TEMPLATE_LIBRARY_PAGE_TEXT,
  buildCategoryPageTitle,
  describeUnlistedCategory,
  resolveTemplatePageText,
} from '../../src/lib/publicPageMeta';
import bundledCatalog from '../sitemap/bundled-catalog.generated.json';

// What a public page says about itself, resolved on the server so link-preview crawlers
// that do not run JavaScript see it. Each resolver mirrors the lookup its page makes and
// returns null when the page would not find anything; the page is then served with
// index.html's generic tags, so a private or missing template reveals nothing.

export interface PublicPageMeta {
  title: string;
  description: string;
  /** The canonical path on the production site. */
  path: string;
  type: 'website' | 'article';
}

/** A public template as the template page needs it; see public-template-lookup.ts. */
export interface PublicTemplateRecord {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ownerUsername: string | null;
}

/** The owner that bundled templates are published under (REPO_TEMPLATE_OWNER_SLUG in the app). */
export const BUNDLED_TEMPLATE_OWNER = 'serp';

const bundledTemplateSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  categories: z.array(z.string()),
});
const bundledTemplates = z.array(bundledTemplateSchema).parse(bundledCatalog.templates);

// Bundled templates list categories the built-in registry does not have ('Tech'). The first
// spelling of each slug names it, as on the category page.
const bundledCategoryNames = new Map<string, string>();
for (const template of bundledTemplates) {
  for (const name of template.categories) {
    const slug = categorySlug(name);
    if (slug && !bundledCategoryNames.has(slug)) bundledCategoryNames.set(slug, name.trim());
  }
}

/** A route parameter, percent-decoded when the router left it encoded. */
export function routeParam(value: string | string[] | undefined): string {
  const raw = (Array.isArray(value) ? value[0] : value) ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export const TEMPLATE_LIBRARY_PAGE: PublicPageMeta = {
  ...TEMPLATE_LIBRARY_PAGE_TEXT,
  path: '/templates',
  type: 'website',
};

export const CATEGORY_INDEX_PAGE: PublicPageMeta = {
  ...CATEGORY_INDEX_PAGE_TEXT,
  path: '/categories',
  type: 'website',
};

const templatePageMeta = (
  template: Parameters<typeof resolveTemplatePageText>[0],
  ownerUsername: string,
  templateSlug: string,
): PublicPageMeta => ({
  ...resolveTemplatePageText(template),
  path: `/profile/${encodeURIComponent(ownerUsername)}/${encodeURIComponent(templateSlug)}`,
  type: 'article',
});

/**
 * /profile/:username/:templateSlug. Like the page, it matches the owner in any letter case
 * and accepts the template id in place of the slug; the canonical path uses the stored
 * username and the slug, as the sitemap does.
 */
export async function resolveTemplatePageMeta(
  username: string,
  identifier: string,
  loadTemplate: (identifier: string) => Promise<PublicTemplateRecord | null>,
): Promise<PublicPageMeta | null> {
  const owner = username.trim().toLowerCase();
  const id = identifier.trim();
  if (!owner || !id) return null;

  if (owner === BUNDLED_TEMPLATE_OWNER) {
    const bundled = bundledTemplates.find((template) => template.slug === id);
    if (bundled) return templatePageMeta(bundled, BUNDLED_TEMPLATE_OWNER, bundled.slug);
  }

  const template = await loadTemplate(id);
  const storedOwner = template?.ownerUsername?.trim();
  if (!template || !storedOwner || storedOwner.toLowerCase() !== owner) return null;
  return templatePageMeta(template, storedOwner, template.slug?.trim() || template.id);
}

/**
 * /categories/:categorySlug, for the built-in categories and those bundled templates use.
 * The slug is normalized like the page does, so other cases and Unicode forms resolve.
 * Categories that only database templates use keep the generic tags: naming them would
 * scan every public template (docs/design-docs/d1-cost.md).
 */
export function resolveCategoryPageMeta(rawSlug: string): PublicPageMeta | null {
  const slug = categorySlug(rawSlug);
  if (!slug) return null;

  const registered = PUBLIC_CATEGORY_REGISTRY.find((category) => category.slug === slug);
  const name = registered?.name ?? bundledCategoryNames.get(slug);
  if (!name) return null;

  return {
    title: buildCategoryPageTitle(name),
    description: registered?.description ?? describeUnlistedCategory(name),
    path: `/categories/${encodeURIComponent(slug)}`,
    type: 'website',
  };
}
