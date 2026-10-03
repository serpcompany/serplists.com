import { getCloudflareContext, initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

import { assertProductionApiUrl } from './scripts/lib/buildEnv';
import { applyDevBindings } from './scripts/lib/dev-bindings';
import { ORGANIZATION_HOME_REDIRECT } from './src/lib/consoleRoutes';
import {
  CONTENT_SECURITY_POLICY,
  LOCAL_CONTENT_SECURITY_POLICY,
  LOCAL_HOST_PATTERN,
  SECURITY_HEADERS,
} from './src/lib/http/securityHeaders';
import { canonicalHostRedirects, trailingSlashRedirects } from './src/lib/http/urlStandard';
import {
  CANONICAL_ORIGIN,
  deploymentOrigin,
  isOnWorkersDev,
  isProductionSite,
  SMOKE_TEST_HEADER,
} from './src/lib/seo/siteOrigin';

const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const workersDevHost = { type: 'host', value: '.+\\.workers\\.dev' } as const;
const wwwHost = { type: 'host', value: 'www\\.serplists\\.com' } as const;
const smokeTestHeader = { type: 'header', key: SMOKE_TEST_HEADER } as const;

const LEGACY_PATH_REDIRECTS = [
  { source: '/checklists', destination: '/templates/', permanent: true },
  { source: '/console', destination: '/dashboard/templates/', permanent: true },
  { source: '/account', destination: '/dashboard/settings/', permanent: true },
  { source: '/dashboard/profile', destination: '/dashboard/settings/', permanent: true },
  { source: '/console/templates/:id', destination: '/dashboard/templates/:id/', permanent: true },
  {
    source: '/console/templates/:id/edit',
    destination: '/dashboard/templates/:id/edit/',
    permanent: true,
  },
  { source: '/console/runs/:id', destination: '/dashboard/runs/:id/', permanent: true },
  { source: '/run/:id', destination: '/dashboard/runs/:id/', permanent: true },
];
const DASHBOARD_HOME_REDIRECT = { source: '/dashboard', destination: '/dashboard/templates/', permanent: false };

const nextConfig: NextConfig = {
  agentRules: false,
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    const localHost = { type: 'host' as const, value: LOCAL_HOST_PATTERN };
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        source: '/:path*',
        missing: [localHost],
        headers: [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }],
      },
      {
        source: '/:path*',
        has: [localHost],
        headers: [{ key: 'Content-Security-Policy', value: LOCAL_CONTENT_SECURITY_POLICY }],
      },
      { source: '/share/:path*', headers: NOINDEX },
      ...(isProductionSite() ? [] : [{ source: '/:path*', headers: NOINDEX }]),
    ];
  },
  async redirects() {
    const siteOrigin = deploymentOrigin();
    return [
      ...(isOnWorkersDev(siteOrigin) ? [] : canonicalHostRedirects(siteOrigin, [workersDevHost], [smokeTestHeader])),
      ...canonicalHostRedirects(CANONICAL_ORIGIN, [wwwHost]),
      ...LEGACY_PATH_REDIRECTS,
      DASHBOARD_HOME_REDIRECT,
      ORGANIZATION_HOME_REDIRECT,
      ...trailingSlashRedirects(),
    ];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    assertProductionApiUrl(process.env);
  }
  return nextConfig;
}

void initOpenNextCloudflareForDev().then(() => applyDevBindings(process.env, getCloudflareContext));
