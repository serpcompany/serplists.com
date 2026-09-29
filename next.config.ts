import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants';

import { assertProductionApiUrl } from './scripts/lib/buildEnv';
import { SECURITY_HEADERS } from './src/lib/http/securityHeaders';

// Only https://serplists.com may be indexed. Staging and each Worker's workers.dev URL serve
// the same app (staging with test data), so they are kept out of search results. Never add
// noindex to a rule that matches serplists.com.
const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
const NON_PRODUCTION_HOSTS = ['staging\\.serplists\\.com', '(?<worker>.+)\\.workers\\.dev'];

const nextConfig: NextConfig = {
  turbopack: {
    // Keep lockfiles outside the repository from changing the workspace root.
    root: process.cwd(),
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      // A share link's page shows one person's run: never indexed.
      { source: '/share/:path*', headers: NOINDEX },
      ...NON_PRODUCTION_HOSTS.map((host) => ({
        source: '/:path*',
        has: [{ type: 'host' as const, value: host }],
        headers: NOINDEX,
      })),
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

// Lets `next dev` read the Cloudflare bindings (D1, R2) through getCloudflareContext().
initOpenNextCloudflareForDev();
