import { canonicalPath } from '../http/urlStandard';

/**
 * The production origin. Canonical links, og:url, and sitemap entries always point
 * here, whichever environment (staging, a local server) served the page.
 * Shared with the API (functions/sitemap/shared.ts), so keep this module pure.
 */
export const CANONICAL_ORIGIN = 'https://serplists.com';

/** Staging's one host (the `preview` environment in wrangler.toml). */
export const STAGING_ORIGIN = 'https://staging.serplists.com';

/**
 * A request with this header is exempt from the redirect of a Worker's workers.dev URL to its
 * environment's host (next.config.ts), so CI can test a deployment there. It is not a secret:
 * it only shows the same public site on another host.
 */
export const SMOKE_TEST_HEADER = 'x-serplists-smoke-test';

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
 * The one host this deployment answers on: serplists.com for production, staging's host for
 * anything else. Every other host that reaches the Worker redirects there (next.config.ts).
 */
export const deploymentOrigin = (env: SiteEnvSource = process.env): string =>
  isProductionSite(env) ? CANONICAL_ORIGIN : STAGING_ORIGIN;

/**
 * The production URL for a path or URL on any host, in the URL standard's canonical form
 * (src/lib/http/urlStandard.ts) and without its query string or hash, so every host and
 * query variant names one canonical page.
 */
export const buildCanonicalUrl = (pathOrUrl: string): string => {
  const { pathname } = new URL(pathOrUrl, CANONICAL_ORIGIN);
  return `${CANONICAL_ORIGIN}${canonicalPath(pathname)}`;
};
