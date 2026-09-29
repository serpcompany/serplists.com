import { describe, expect, it, vi } from 'vitest';

import { canonicalPath } from '@/lib/http/urlStandard';
import { SMOKE_TEST_HEADER } from '@/lib/seo/siteOrigin';

import {
  loadBuiltRoutes,
  nextServerRedirect,
  workerRedirect,
  type RedirectResult,
  type RequestOptions,
} from '../../support/nextRouting';

// OpenNext reads the Next.js config from the build; give its routing the one next.config.ts makes.
vi.mock('@opennextjs/aws/adapters/config/index.js', async () => {
  const { openNextBuildConfig } = await import('../../support/nextRouting');
  return openNextBuildConfig();
});

// The SERP URL standard: pages end in a slash, files never do, the other form redirects (308)
// to the canonical one in one hop, and only the canonical form answers. The API and
// /.well-known are not pages and are never redirected on their own host. Each environment
// answers on one host; www and workers.dev hosts redirect there in one hop, and the smoke-test
// header exempts workers.dev. Every case runs through Next.js's server and through OpenNext's
// routing in the Worker, which must agree.

const PRODUCTION = await loadBuiltRoutes('production');
const STAGING = await loadBuiltRoutes('staging');
const LOCAL = await loadBuiltRoutes(undefined);

type Build = typeof PRODUCTION;

/** The redirect a request gets; fails when Next.js and the Worker would answer differently. */
async function redirectFor(build: Build, url: string, options?: RequestOptions): Promise<RedirectResult | null> {
  const worker = await workerRedirect(build.redirects, url, options);
  const nextServer = nextServerRedirect(build.redirects, url, options);
  expect(nextServer === null ? null : resolve(nextServer, url), `next start: ${url}`).toEqual(
    worker === null ? null : resolve(worker, url),
  );
  return worker;
}

const resolve = ({ status, location }: RedirectResult, base: string): RedirectResult => ({
  status,
  location: new URL(location, base).href,
});

const ORIGIN = 'https://serplists.com';

// Every kind of page the app has, in canonical form.
const CANONICAL_PAGES = [
  '/',
  '/about/',
  '/pricing/',
  '/login/',
  '/reset-password/',
  '/templates/',
  '/categories/',
  '/categories/seo/',
  '/categories/%E6%97%A5%E6%9C%AC%E8%AA%9E/',
  '/features/',
  '/features/template-builder/',
  '/profile/serp/',
  '/profile/john.doe/',
  '/profile/serp/ultimate-camping-checklist/',
  '/profile/john.doe/weekly-review/',
  '/share/5b0d4a1e-6c1f-4f55-9d3e-2a7f0c7d9e11/',
  '/team-invites/5b0d4a1e-6c1f-4f55-9d3e-2a7f0c7d9e11-0c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f/',
  '/dashboard/templates/',
  '/dashboard/templates/new/',
  '/dashboard/templates/tpl-1/',
  '/dashboard/templates/tpl-1/edit/',
  '/dashboard/runs/run-1/',
  '/dashboard/settings/',
];

const CANONICAL_FILES = [
  '/robots.txt',
  '/sitemap.xml',
  '/sitemaps/pages/1.xml',
  '/sitemaps/templates/12.xml',
  '/categories/sitemap.xml',
  '/favicon.ico',
  '/og-default.png',
];

// The API as its callers use it: Better Auth, the Stripe webhook, the MCP endpoint, uploads.
const API_PATHS = [
  '/api',
  '/api/health',
  '/api/auth/get-session',
  '/api/auth/sign-in/email',
  '/api/auth/reset-password/abc123',
  '/api/stripe/webhook',
  '/api/mcp',
  '/api/uploads/file',
  '/api/uploads/avatars/me.png',
  '/api/templates/slug/weekly-review',
];

describe('the canonical form (canonicalPath)', () => {
  it('keeps canonical pages and files as they are', () => {
    for (const path of [...CANONICAL_PAGES, ...CANONICAL_FILES]) expect(canonicalPath(path), path).toBe(path);
  });

  it('gives a page its slash and takes a file its slash', () => {
    expect(canonicalPath('/about')).toBe('/about/');
    expect(canonicalPath('/profile/john.doe')).toBe('/profile/john.doe/');
    expect(canonicalPath('/robots.txt/')).toBe('/robots.txt');
    expect(canonicalPath('/sitemaps/pages/1.xml/')).toBe('/sitemaps/pages/1.xml');
  });

  it('leaves the API and /.well-known alone', () => {
    for (const path of [...API_PATHS, '/api/health/', '/.well-known/security.txt', '/.well-known/x/']) {
      expect(canonicalPath(path), path).toBe(path);
    }
  });
});

describe.each([
  ['production', PRODUCTION],
  ['staging', STAGING],
  ['a local build', LOCAL],
] as const)('paths on the environment host (%s build)', (_name, build) => {
  it('answers every canonical URL without a redirect', async () => {
    for (const path of [...CANONICAL_PAGES, ...CANONICAL_FILES]) {
      expect(await redirectFor(build, `${ORIGIN}${path}`), path).toBeNull();
    }
  });

  it('sends a page without its slash to the slashed page, in one hop', async () => {
    for (const page of CANONICAL_PAGES.filter((path) => path !== '/')) {
      const bare = page.slice(0, -1);
      expect(await redirectFor(build, `${ORIGIN}${bare}`), bare).toEqual({ status: 308, location: page });
    }
  });

  it('sends a file with a slash to the file, in one hop', async () => {
    for (const file of CANONICAL_FILES) {
      expect(await redirectFor(build, `${ORIGIN}${file}/`), file).toEqual({ status: 308, location: file });
    }
  });

  it('keeps the query string', async () => {
    expect(await redirectFor(build, `${ORIGIN}/login?next=%2Fdashboard%2Ftemplates%2F&verified=1`)).toEqual({
      status: 308,
      location: '/login/?next=%2Fdashboard%2Ftemplates%2F&verified=1',
    });
    expect(await redirectFor(build, `${ORIGIN}/sitemaps/pages/1.xml/?page=2`)).toEqual({
      status: 308,
      location: '/sitemaps/pages/1.xml?page=2',
    });
  });

  it('never redirects the API or /.well-known, with or without a trailing slash', async () => {
    for (const path of [...API_PATHS, ...API_PATHS.map((apiPath) => `${apiPath}/`)]) {
      expect(await redirectFor(build, `${ORIGIN}${path}`), path).toBeNull();
      expect(await redirectFor(build, `${ORIGIN}${path}?token=abc`), path).toBeNull();
    }
    for (const path of ['/.well-known', '/.well-known/', '/.well-known/security.txt', '/.well-known/security.txt/', '/.well-known/x', '/.well-known/x/']) {
      expect(await redirectFor(build, `${ORIGIN}${path}`), path).toBeNull();
    }
  });

  it('leaves a first segment that only starts like the API to the standard', async () => {
    expect(await redirectFor(build, `${ORIGIN}/apis`)).toEqual({ status: 308, location: '/apis/' });
    expect(await redirectFor(build, `${ORIGIN}/profile/api`)).toEqual({ status: 308, location: '/profile/api/' });
    expect(await redirectFor(build, `${ORIGIN}/profile/api/weekly-review`)).toEqual({
      status: 308,
      location: '/profile/api/weekly-review/',
    });
  });

  it('never redirects Next.js internals', async () => {
    for (const path of ['/_next/static/chunks/app.js', '/_next/image', '/_next/data/build/index.json']) {
      expect(await redirectFor(build, `${ORIGIN}${path}`), path).toBeNull();
    }
  });

  it('agrees with canonicalPath on every form of every path', async () => {
    const paths = [...CANONICAL_PAGES, ...CANONICAL_FILES].flatMap((path) =>
      path === '/' ? [path] : [path, path.endsWith('/') ? path.slice(0, -1) : `${path}/`],
    );
    for (const path of paths) {
      const redirect = await redirectFor(build, `${ORIGIN}${path}`);
      expect(redirect?.location ?? path, path).toBe(canonicalPath(path));
    }
  });
});

describe.each([
  ['production', PRODUCTION, 'https://serplists.com'],
  ['staging', STAGING, 'https://staging.serplists.com'],
] as const)('other hosts (%s build)', (_name, build, canonicalOrigin) => {
  const WORKERS_DEV = [
    'https://serp-checklists-production.serp.workers.dev',
    'https://serp-checklists-preview.serp.workers.dev',
    // A version preview URL.
    'https://3f2a1b9c-serp-checklists-preview.serp.workers.dev',
  ];

  it('sends every workers.dev URL to the environment host, in canonical form and one hop', async () => {
    for (const host of WORKERS_DEV) {
      for (const [path, canonical] of [
        ['/', '/'],
        ['/about', '/about/'],
        ['/about/', '/about/'],
        ['/profile/john.doe', '/profile/john.doe/'],
        ['/profile/serp/ultimate-camping-checklist', '/profile/serp/ultimate-camping-checklist/'],
        ['/robots.txt', '/robots.txt'],
        ['/robots.txt/', '/robots.txt'],
        ['/sitemaps/pages/1.xml/', '/sitemaps/pages/1.xml'],
        ['/login?next=%2Fdashboard%2F', '/login/?next=%2Fdashboard%2F'],
      ]) {
        expect(await redirectFor(build, `${host}${path}`), `${host}${path}`).toEqual({
          status: 308,
          location: `${canonicalOrigin}${canonical}`,
        });
      }
    }
  });

  it('keeps the exact API path when it sends the API there', async () => {
    for (const path of ['/api/mcp', '/api/auth/get-session', '/api/health/', '/api', '/api/', '/.well-known/security.txt']) {
      expect(await redirectFor(build, `${WORKERS_DEV[0]}${path}`), path).toEqual({
        status: 308,
        location: `${canonicalOrigin}${path}`,
      });
    }
  });

  it('serves a workers.dev request that carries the smoke-test header', async () => {
    const smokeTest = { headers: { [SMOKE_TEST_HEADER]: '1' } };
    for (const path of ['/', '/about/', '/robots.txt', '/api/health']) {
      expect(await redirectFor(build, `${WORKERS_DEV[0]}${path}`, smokeTest), path).toBeNull();
    }
    // The header does not skip the URL standard itself.
    expect(await redirectFor(build, `${WORKERS_DEV[0]}/about`, smokeTest)).toEqual({ status: 308, location: '/about/' });
  });

  it('sends www to serplists.com, whatever the environment, with no smoke-test exemption', async () => {
    for (const options of [undefined, { headers: { [SMOKE_TEST_HEADER]: '1' } }]) {
      expect(await redirectFor(build, 'https://www.serplists.com/pricing', options)).toEqual({
        status: 308,
        location: 'https://serplists.com/pricing/',
      });
      expect(await redirectFor(build, 'https://www.serplists.com/', options)).toEqual({
        status: 308,
        location: 'https://serplists.com/',
      });
    }
  });

  it('leaves the environment host and local servers alone', async () => {
    for (const origin of [canonicalOrigin, 'http://localhost:4173', 'http://127.0.0.1:3000']) {
      expect(await redirectFor(build, `${origin}/about/`), origin).toBeNull();
      expect(await redirectFor(build, `${origin}/api/health`), origin).toBeNull();
    }
  });
});

describe('legacy paths', () => {
  it.each([
    ['/account', '/dashboard/settings/', 308],
    ['/dashboard/profile', '/dashboard/settings/', 308],
    ['/console', '/dashboard/templates/', 308],
    ['/checklists', '/templates/', 308],
    ['/console/templates/tpl-1', '/dashboard/templates/tpl-1/', 308],
    ['/console/templates/tpl-1/edit', '/dashboard/templates/tpl-1/edit/', 308],
    ['/console/runs/run-1', '/dashboard/runs/run-1/', 308],
    // A Run's one URL is under /dashboard/runs/.
    ['/run/run-1', '/dashboard/runs/run-1/', 308],
    // The dashboard home is My Templates for now, which may change.
    ['/dashboard', '/dashboard/templates/', 307],
  ])('sends %s, with or without its slash, straight to %s', async (from, to, status) => {
    for (const path of [from, `${from}/`]) {
      expect(await redirectFor(PRODUCTION, `${ORIGIN}${path}`), path).toEqual({ status, location: to });
      // One hop: the destination is served.
      expect(await redirectFor(PRODUCTION, `${ORIGIN}${to}`), to).toBeNull();
    }
  });

  it('passes the query through, so the Stripe billing result reaches the page', async () => {
    expect(await redirectFor(PRODUCTION, `${ORIGIN}/account?billing=success`)).toEqual({
      status: 308,
      location: '/dashboard/settings/?billing=success',
    });
  });
});
