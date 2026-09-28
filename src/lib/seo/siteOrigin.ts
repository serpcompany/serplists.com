/**
 * The production origin. Canonical links, og:url, and sitemap entries always point
 * here, whichever host (staging, a *.pages.dev alias, localhost) served the page.
 * Shared with the API (functions/sitemap/shared.ts), so keep this module pure.
 */
export const CANONICAL_ORIGIN = 'https://serplists.com';

const CANONICAL_HOSTNAME = new URL(CANONICAL_ORIGIN).hostname;

/**
 * Only the production host may be indexed. Staging, the *.pages.dev aliases, and
 * local hosts serve the same app and must stay out of search results.
 */
export const isIndexableHost = (hostname: string | null | undefined): boolean =>
  (hostname ?? '').toLowerCase() === CANONICAL_HOSTNAME;

/**
 * The production URL for a path or URL on any host, without its query string or
 * hash, so every host and query variant names one canonical page.
 */
export const buildCanonicalUrl = (pathOrUrl: string): string => {
  const { pathname } = new URL(pathOrUrl, CANONICAL_ORIGIN);
  return `${CANONICAL_ORIGIN}${pathname}`;
};
