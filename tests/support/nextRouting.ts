import { IncomingMessage, type IncomingHttpHeaders } from 'node:http';
import { Socket } from 'node:net';
import { format } from 'node:url';

import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { buildCustomRoute } from 'next/dist/lib/build-custom-route';
import loadCustomRoutes from 'next/dist/lib/load-custom-routes';
import { modifyRouteRegex } from 'next/dist/lib/redirect-status';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { matchHas, prepareDestination } from 'next/dist/shared/lib/router/utils/prepare-destination';
import type { NextConfig } from 'next';
import type { ManifestRedirectRoute } from 'next/dist/build';
import type { RedirectDefinition } from '@opennextjs/aws/types/next-types.js';
import type { InternalEvent } from '@opennextjs/aws/types/open-next.js';

import nextConfigFor from '../../next.config';

import { withSiteEnv } from './siteEnv';

export { withSiteEnv };

export interface RedirectResult {
  status: number;
  location: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
}

type ManifestRedirect = RedirectDefinition & { statusCode: number };

function withItsStatusCode(route: ManifestRedirectRoute): ManifestRedirect {
  if (route.statusCode === undefined) throw new Error(`Next.js built the redirect from ${route.source} without a status code.`);
  return { ...route, statusCode: route.statusCode };
}

function requestWithHeaders(headers: IncomingHttpHeaders): IncomingMessage {
  const request = new IncomingMessage(new Socket());
  request.headers = headers;
  return request;
}

type HeaderRule = Awaited<ReturnType<NonNullable<NextConfig['headers']>>>[number];

export const nextConfig = (): NextConfig => nextConfigFor(PHASE_PRODUCTION_SERVER);

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

export async function loadBuiltRoutes(siteEnv: string | undefined) {
  return withSiteEnv(siteEnv, async () => {
    const config = nextConfig();
    const routes = await loadCustomRoutes(config as Parameters<typeof loadCustomRoutes>[0]);
    return {
      config,
      redirects: routes.redirects.map((route) => withItsStatusCode(buildCustomRoute('redirect', route, ['/_next']))),
      headers: routes.headers as HeaderRule[],
    };
  });
}

const splitUrl = (url: string) => {
  const parsed = new URL(url);
  return { parsed, query: Object.fromEntries(parsed.searchParams) };
};

export function nextServerRedirect(
  redirects: ManifestRedirect[],
  url: string,
  { headers = {} }: RequestOptions = {},
): RedirectResult | null {
  const { parsed, query } = splitUrl(url);
  const req = requestWithHeaders({ ...lowercaseKeys(headers), host: parsed.host });
  for (const route of redirects) {
    const match = getPathMatch(route.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex: string) => (route.internal ? regex : modifyRouteRegex(regex, ['/_next'])),
    });
    let params = match(parsed.pathname);
    if (params && (route.has || route.missing)) {
      const hasParams = matchHas(req, query, route.has, route.missing);
      params = hasParams ? Object.assign(params, hasParams) : false;
    }
    if (!params) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: route.destination,
      params,
      query,
    });
    const search = new URLSearchParams(
      Object.entries(parsedDestination.query).map(([key, value]) => [key, String(value)]),
    ).toString();
    delete (parsedDestination as { query?: unknown }).query;
    parsedDestination.search = search ? `?${search}` : '';
    return { status: route.statusCode, location: format(parsedDestination) };
  }
  return null;
}

export async function workerRedirect(
  redirects: ManifestRedirect[],
  url: string,
  { headers = {} }: RequestOptions = {},
): Promise<RedirectResult | null> {
  const { handleRedirects } = await import('@opennextjs/aws/core/routing/matcher.js');
  const { normalizeLocationHeader } = await import('@opennextjs/aws/core/routing/util.js');
  const { parsed, query } = splitUrl(url);
  const event: InternalEvent = {
    type: 'core',
    method: 'GET',
    rawPath: parsed.pathname,
    url: parsed.href,
    headers: { ...lowercaseKeys(headers), host: parsed.host },
    query,
    cookies: {},
    remoteAddress: '127.0.0.1',
  };
  const result = handleRedirects(event, redirects);
  if (!result) return null;
  const locationAsRoutingHandlerWritesIt = normalizeLocationHeader(String(result.headers['Location']), parsed.href, true);
  return { status: result.statusCode, location: locationAsRoutingHandlerWritesIt };
}

export function headersFor(rules: HeaderRule[], url: string): Map<string, string[]> {
  const { parsed, query } = splitUrl(url);
  const req = requestWithHeaders({ host: parsed.host });
  const applied = new Map<string, string[]>();
  for (const rule of rules) {
    const match = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex: string) => modifyRouteRegex(regex),
    });
    if (match(parsed.pathname) === false) continue;
    if (matchHas(req, query, rule.has, rule.missing) === false) continue;
    for (const { key, value } of rule.headers) {
      applied.set(key.toLowerCase(), [...(applied.get(key.toLowerCase()) ?? []), value]);
    }
  }
  return applied;
}

function lowercaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}
