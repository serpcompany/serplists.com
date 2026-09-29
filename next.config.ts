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
import { canonicalHostRedirects, trailingSlashRedirects } from './src/lib/http/urlStandard';
import {
  CANONICAL_ORIGIN,
  deploymentOrigin,
  isProductionSite,
  SMOKE_TEST_HEADER,
} from './src/lib/seo/siteOrigin';

const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

// Each environment answers on one host (SERP environment configuration standard): every other
// host that reaches its Worker redirects there. A request with the smoke-test header skips the
// workers.dev redirect, so CI can test a deployment on its workers.dev URL.
const workersDevHost = { type: 'host', value: '.+\\.workers\\.dev' } as const;
const wwwHost = { type: 'host', value: 'www\\.serplists\\.com' } as const;
const smokeTest = { type: 'header', key: SMOKE_TEST_HEADER } as const;

const nextConfig: NextConfig = {
  // SERP URL standard (src/lib/http/urlStandard.ts): pages end in a slash (/about/), files and
  // the API never do. Next.js's own trailing-slash redirects would move the API too
  // (/api/auth/sign-in to /api/auth/sign-in/), and Stripe and agents do not follow redirects,
  // so the redirects below do that work instead. trailingSlash still gives the URLs Next.js
  // writes (canonical and Open Graph URLs) their slash.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
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
      // Only a build made with SITE_ENV=production may be indexed (public/_headers does the same
      // for static files, and src/app/robots.ts for crawlers). Everything else, staging and local
      // builds included, answers noindex.
      ...(isProductionSite() ? [] : [{ source: '/:path*', headers: NOINDEX }]),
    ];
  },
  async redirects() {
    return [
      // Other hosts first, so they reach the canonical host in one hop.
      ...canonicalHostRedirects(deploymentOrigin(), [workersDevHost], [smokeTest]),
      // www serves the production Worker.
      ...canonicalHostRedirects(CANONICAL_ORIGIN, [wwwHost]),
      // Paths from earlier versions of the app, each straight to its page's canonical URL.
      // A source matches with or without its trailing slash.
      { source: '/checklists', destination: '/templates/', permanent: true },
      { source: '/console', destination: '/dashboard/templates/', permanent: true },
      // /dashboard/ is not a page: it opens the dashboard's home, My Templates for now, which
      // may change (buildConsoleHomePath in src/lib/routes.ts, which links use instead).
      { source: '/dashboard', destination: '/dashboard/templates/', permanent: false },
      { source: '/account', destination: '/dashboard/settings/', permanent: true },
      { source: '/dashboard/profile', destination: '/dashboard/settings/', permanent: true },
      { source: '/console/templates/:id', destination: '/dashboard/templates/:id/', permanent: true },
      {
        source: '/console/templates/:id/edit',
        destination: '/dashboard/templates/:id/edit/',
        permanent: true,
      },
      { source: '/console/runs/:id', destination: '/dashboard/runs/:id/', permanent: true },
      // A Run's page used to answer at /run/<id>/ as well; /dashboard/runs/<id>/ is its one URL.
      { source: '/run/:id', destination: '/dashboard/runs/:id/', permanent: true },
      // Every other path in its canonical form: /about to /about/, /robots.txt/ to /robots.txt.
      ...trailingSlashRedirects(),
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
