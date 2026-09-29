/**
 * The production origin. Canonical links, og:url, and sitemap entries always point
 * here, whichever environment (staging, a local server) served the page.
 * Shared with the API (functions/sitemap/shared.ts), so keep this module pure.
 */
export const CANONICAL_ORIGIN = 'https://serplists.com';

type SiteEnvSource = Readonly<Record<string, string | undefined>>;

/**
 * True only where SITE_ENV=production: the production Worker's vars, for what renders on
 * request, and the production build, for what renders at build time (static pages, the
 * next.config.ts headers and redirects, public/_headers). Anything else is not production:
 * it is kept out of search engines and loads no analytics. Read it where it is used, never
 * at module load, where a Worker's vars are not set yet.
 */
export const isProductionSite = (env: SiteEnvSource = process.env): boolean =>
  env.SITE_ENV === 'production';

/**
 * The production URL for a path or URL on any host, without its query string or
 * hash, so every host and query variant names one canonical page.
 */
export const buildCanonicalUrl = (pathOrUrl: string): string => {
  const { pathname } = new URL(pathOrUrl, CANONICAL_ORIGIN);
  return `${CANONICAL_ORIGIN}${pathname}`;
};
