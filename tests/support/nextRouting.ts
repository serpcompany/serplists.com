// Runs next.config.ts's redirects and headers the two ways the app is served:
// - `nextServerRedirect`: Next.js's own server (`next dev`, `next start`), with the matcher,
//   has/missing check and destination compiler it uses (resolve-routes.js).
// - `workerRedirect`: the Worker, where OpenNext's routing (the real handleRedirects from
//   @opennextjs/aws) applies the build's routes manifest. tests/unit/config/nextRouting.mock.ts
//   gives it the config OpenNext would read from the build.
// Both load the rules the way `next build` does (loadCustomRoutes validates them, then each
// becomes a manifest entry with its regex), for a build made with the given SITE_ENV.
import { format } from 'node:url';

import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { buildCustomRoute } from 'next/dist/lib/build-custom-route';
import loadCustomRoutes from 'next/dist/lib/load-custom-routes';
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { matchHas, prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import type { NextConfig } from 'next';

import nextConfigFor from '../../next.config';

import { withSiteEnv } from './siteEnv';

export { withSiteEnv };

export interface RedirectResult {
  status: number;
  location: string;
}

export interface RequestOptions {
  /** Request headers other than Host (which comes from the URL). */
  headers?: Record<string, string>;
}

type ManifestRedirect = ReturnType<typeof buildCustomRoute> & {
  statusCode: number;
  internal?: boolean;
};

type HeaderRule = Awaited<ReturnType<NonNullable<NextConfig['headers']>>>[number];

export const nextConfig = (): NextConfig => nextConfigFor(PHASE_PRODUCTION_SERVER);

/**
 * What OpenNext's routing reads from a build (@opennextjs/aws/adapters/config), for a test that
 * mocks that module: the Next.js config and empty manifests (redirects are passed in).
 */
export const openNextBuildConfig = () => ({
  NextConfig: nextConfig(),
  BuildId: 'test-build',
  HtmlPages: [],
  RoutesManifest: {
    basePath: '',
    locales: [],
    routes: { static: [], dynamic: [], data: { static: [], dynamic: [] } },
    redirects: [],
    rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
  },
  ConfigHeaders: [],
  PrerenderManifest: { routes: {}, dynamicRoutes: {} },
  PagesManifest: {},
  AppPathsManifestKeys: [],
  MiddlewareManifest: { middleware: {}, functions: {}, sortedMiddleware: [] },
  AppPathsManifest: {},
  AppPathRoutesManifest: {},
  FunctionsConfigManifest: { functions: {} },
});

/** The redirects and headers a build made with this SITE_ENV has, as its routes manifest lists them. */
export async function loadBuiltRoutes(siteEnv: string | undefined) {
  return withSiteEnv(siteEnv, async () => {
    const config = nextConfig();
    const routes = await loadCustomRoutes(config as Parameters<typeof loadCustomRoutes>[0]);
    return {
      config,
      redirects: routes.redirects.map(
        (route) => buildCustomRoute('redirect', route, ['/_next']) as ManifestRedirect,
      ),
      headers: routes.headers as HeaderRule[],
    };
  });
}

const splitUrl = (url: string) => {
  const parsed = new URL(url);
  return { parsed, query: Object.fromEntries(parsed.searchParams) };
};

/** What `next dev` and `next start` answer: a redirect, or null when the request is served. */
export function nextServerRedirect(
  redirects: ManifestRedirect[],
  url: string,
  { headers = {} }: RequestOptions = {},
): RedirectResult | null {
  const { parsed, query } = splitUrl(url);
  const req = { headers: { ...lowercaseKeys(headers), host: parsed.host } };
  for (const route of redirects) {
    const match = getPathMatch(route.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex: string) => (route.internal ? regex : modifyRouteRegex(regex, ['/_next'])),
    });
    let params = match(parsed.pathname);
    if (params && (route.has || route.missing)) {
      const hasParams = matchHas(req as never, query, route.has, route.missing);
      params = hasParams ? Object.assign(params, hasParams) : false;
    }
    if (!params) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: route.destination,
      params,
      query,
    });
    const search = new URLSearchParams(parsedDestination.query as Record<string, string>).toString();
    delete (parsedDestination as { query?: unknown }).query;
    parsedDestination.search = search ? `?${search}` : '';
    return { status: route.statusCode, location: format(parsedDestination) };
  }
  return null;
}

/** What the Worker answers: OpenNext's routing, before anything renders. */
export async function workerRedirect(
  redirects: ManifestRedirect[],
  url: string,
  { headers = {} }: RequestOptions = {},
): Promise<RedirectResult | null> {
  const { handleRedirects } = await import('@opennextjs/aws/core/routing/matcher.js');
  const { normalizeLocationHeader } = await import('@opennextjs/aws/core/routing/util.js');
  const { parsed, query } = splitUrl(url);
  const event = {
    type: 'core',
    method: 'GET',
    rawPath: parsed.pathname,
    url: parsed.href,
    headers: { ...lowercaseKeys(headers), host: parsed.host },
    query,
    cookies: {},
    remoteAddress: '127.0.0.1',
  };
  const result = handleRedirects(event as never, redirects as never);
  if (!result) return null;
  return {
    status: result.statusCode,
    // routingHandler writes the Location this way (relative on the same origin).
    location: normalizeLocationHeader(String(result.headers.Location), parsed.href, true),
  };
}

/** The headers a response gets from next.config.ts, as the routes manifest applies them. */
export function headersFor(rules: HeaderRule[], url: string): Map<string, string[]> {
  const { parsed, query } = splitUrl(url);
  const req = { headers: { host: parsed.host } };
  const applied = new Map<string, string[]>();
  for (const rule of rules) {
    const match = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex: string) => modifyRouteRegex(regex),
    });
    if (match(parsed.pathname) === false) continue;
    if (matchHas(req as never, query, rule.has, rule.missing) === false) continue;
    for (const { key, value } of rule.headers) {
      applied.set(key.toLowerCase(), [...(applied.get(key.toLowerCase()) ?? []), value]);
    }
  }
  return applied;
}

function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}
