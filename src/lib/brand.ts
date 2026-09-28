export const APP_BRAND_NAME = 'SERP Lists';

/** The site description in index.html, and the default for pages without their own. */
export const SITE_DEFAULT_DESCRIPTION = 'Create and run checklists for your processes.';

const BRAND_SUFFIX = ` | ${APP_BRAND_NAME}`;

/** "Page | SERP Lists"; the brand alone when the page has no title of its own. */
export const buildPageTitle = (title?: string): string => {
  const trimmed = title?.trim();
  if (!trimmed) return APP_BRAND_NAME;
  if (trimmed === APP_BRAND_NAME || trimmed.endsWith(BRAND_SUFFIX)) return trimmed;
  return `${trimmed}${BRAND_SUFFIX}`;
};
