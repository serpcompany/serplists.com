import { canonicalPath } from '../http/urlStandard';

export const CANONICAL_ORIGIN = 'https://serplists.com';

export const STAGING_ORIGIN = 'https://staging.serplists.com';

export const SMOKE_TEST_HEADER = 'x-serplists-smoke-test';

type SiteEnvSource = { readonly SITE_ENV?: string | undefined; readonly [name: string]: string | undefined };

export const isProductionSite = (env: SiteEnvSource = process.env): boolean =>
  env.SITE_ENV === 'production';

export const deploymentOrigin = (env: SiteEnvSource = process.env): string =>
  isProductionSite(env) ? CANONICAL_ORIGIN : STAGING_ORIGIN;

export const isOnWorkersDev = (origin: string): boolean => new URL(origin).hostname.endsWith('.workers.dev');

export const buildCanonicalUrl = (pathOrUrl: string): string => {
  const { pathname } = new URL(pathOrUrl, CANONICAL_ORIGIN);
  return `${CANONICAL_ORIGIN}${canonicalPath(pathname)}`;
};
