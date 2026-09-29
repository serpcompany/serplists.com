import { getCloudflareContext, initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

import { assertProductionApiUrl } from './scripts/lib/buildEnv';
import { applyDevBindings } from './scripts/lib/dev-bindings.mjs';
import {
  CONTENT_SECURITY_POLICY,
  LOCAL_CONTENT_SECURITY_POLICY,
  LOCAL_HOSTS,
  SECURITY_HEADERS,
} from './src/lib/http/securityHeaders';

// Only https://serplists.com may be indexed. Every other host serves the same app (staging
// with test data, each Worker's workers.dev URL, a local server), so it is kept out of search
// results, whatever a page's own robots tag says. Never add noindex to a rule that matches
// serplists.com.
const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
const PRODUCTION_HOST = 'serplists\\.com';

const nextConfig: NextConfig = {
  turbopack: {
    // Keep lockfiles outside the repository from changing the workspace root.
    root: process.cwd(),
  },
  async headers() {
    const localHost = { type: 'host' as const, value: LOCAL_HOSTS };
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      {
        source: '/:path*',
        missing: [localHost],
        headers: [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }],
      },
      // Local servers run on http, where upgrade-insecure-requests breaks redirects.
      {
        source: '/:path*',
        has: [localHost],
        headers: [{ key: 'Content-Security-Policy', value: LOCAL_CONTENT_SECURITY_POLICY }],
      },
      // A share link's page shows one person's run: never indexed.
      { source: '/share/:path*', headers: NOINDEX },
      { source: '/:path*', missing: [{ type: 'host', value: PRODUCTION_HOST }], headers: NOINDEX },
    ];
  },
  async redirects() {
    return [
      // Paths from earlier versions of the app.
      { source: '/checklists', destination: '/templates', permanent: true },
      { source: '/console', destination: '/dashboard/templates', permanent: true },
      { source: '/dashboard', destination: '/dashboard/templates', permanent: false },
      { source: '/account', destination: '/dashboard/settings', permanent: true },
      { source: '/dashboard/profile', destination: '/dashboard/settings', permanent: true },
      { source: '/console/templates/:id', destination: '/dashboard/templates/:id', permanent: true },
      {
        source: '/console/templates/:id/edit',
        destination: '/dashboard/templates/:id/edit',
        permanent: true,
      },
      { source: '/console/runs/:id', destination: '/dashboard/runs/:id', permanent: true },
    ];
  },
};

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) {
    // Next.js inlines NEXT_PUBLIC_* values into the browser bundle: a build must not ship
    // a localhost API URL.
    assertProductionApiUrl(process.env);
  }
  return nextConfig;
}

// Lets `next dev` read the Cloudflare bindings (D1, R2, and the vars in wrangler.toml and
// .dev.vars) through getCloudflareContext(), with the vars `pnpm run dev:all` sets for the port
// it picked (scripts/lib/dev-bindings.mjs).
void initOpenNextCloudflareForDev().then(() => applyDevBindings(process.env, getCloudflareContext));
