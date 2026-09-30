// How public pages describe themselves to search engines and link previews. The pages'
// server metadata (src/app, src/server/pageMeta) reads these and the pages show the same
// text, so a shared link's preview says what the page says. Keep it framework-free: it is in
// SHARED_FROM_SRC in .dependency-cruiser.cjs, so import siblings by relative path.
import { APP_BRAND_NAME } from './brand';
import { formatCount } from './utils/pluralize';

/**
 * The link-preview image for every page: public/og-default.png. It must be a PNG or JPEG
 * with an absolute URL; Facebook, X, LinkedIn and Slack ignore SVG and relative URLs.
 */
export const SITE_SOCIAL_IMAGE = {
  path: '/og-default.png',
  width: 1200,
  height: 630,
  alt: APP_BRAND_NAME,
} as const;

// The Template Library (docs/PRODUCT_SENSE.md): its page heading says the same.
export const TEMPLATE_LIBRARY_PAGE_TEXT = {
  title: 'Template Library',
  description: 'Browse hundreds of ready-to-use checklist templates created by the community.',
} as const;

export const CATEGORY_INDEX_PAGE_TEXT = {
  title: 'Browse Template Categories',
  description: 'Explore checklist templates organized by category.',
} as const;

export const TEMPLATE_NOT_FOUND_PAGE_TEXT = {
  title: 'Template not found',
  description: 'The template you are looking for does not exist or is no longer public.',
} as const;

export const PROFILE_NOT_FOUND_PAGE_TEXT = {
  title: 'Profile not found',
  description: 'This profile does not exist.',
} as const;

export const buildCategoryPageTitle = (categoryName: string): string => `${categoryName} Templates`;

/** A category page's description: with its template count once the catalog has loaded. */
export const describeCategoryPage = (
  category: { name: string; description: string },
  templateCount: number | null,
): string =>
  templateCount === null
    ? `Templates for ${category.name}. ${category.description}`
    : `${formatCount(templateCount, 'template')} for ${category.name}. ${category.description}`;

/** The description of a category that is not one of the built-in ones. */
export const describeUnlistedCategory = (categoryName: string): string =>
  `Templates filed under ${categoryName}.`;

export interface TemplatePageSource {
  title: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

/** A public template page's title and description: the SEO fields win when filled in. */
export const resolveTemplatePageText = (
  template: TemplatePageSource,
): { title: string; description: string } => ({
  title: template.seoTitle?.trim() || template.title,
  description:
    template.seoDescription?.trim() ||
    template.description?.trim() ||
    `${template.title} - Interactive checklist template`,
});
