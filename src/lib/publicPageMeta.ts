// How public pages describe themselves to search engines and link previews. Each page's
// SEOHead reads these, and so do the Pages Functions that fill index.html's tags for
// crawlers that do not run JavaScript (functions/seo/), so a shared link's preview says
// what the page says. Keep it framework-free: it is in SHARED_FROM_SRC in
// .dependency-cruiser.cjs, so import siblings by relative path.
import { APP_BRAND_NAME } from './brand';

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

export const TEMPLATE_LIBRARY_PAGE_TEXT = {
  title: 'Discover Templates',
  description: 'Browse hundreds of ready-to-use checklist templates created by the community.',
} as const;

export const CATEGORY_INDEX_PAGE_TEXT = {
  title: 'Browse Template Categories',
  description: 'Explore checklist templates organized by category.',
} as const;

export const buildCategoryPageTitle = (categoryName: string): string => `${categoryName} Templates`;

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
