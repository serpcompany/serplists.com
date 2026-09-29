import { expect, test, type APIRequestContext } from '@playwright/test';

import { SMOKE_TEST_HEADER } from '../../scripts/check-site-standards.mjs';
import { APP_URL } from './support/stack';

// The SERP URL and environment standards on the production build (the browser tests run it
// with SITE_ENV=production, tests/e2e/run-smoke-lib.mjs):
// - a page ends in a slash and a file never does; the other form answers 308 with the
//   canonical URL, in one hop, and only the canonical URL answers 200;
// - the API is not a page and answers at the path it is called with, never with a redirect;
// - the site links only to canonical URLs, so no link depends on a redirect;
// - production may be indexed, and every other host redirects to serplists.com.
// Staging's side (noindex, crawlers disallowed) is checked by tests/unit/seo/siteEnvIndexing.test.ts
// and, on a running staging build, by scripts/check-site-standards.mjs.

const get = (request: APIRequestContext, path: string, headers: Record<string, string> = {}) =>
  request.get(`${APP_URL}${path}`, { headers, maxRedirects: 0 });

/** Where a redirect sends the request, as an absolute URL. */
const locationOf = (response: { headers(): Record<string, string> }, base = APP_URL) =>
  new URL(response.headers().location ?? '', base).href;

const PAGES = [
  '/',
  '/about/',
  '/pricing/',
  '/contact/',
  '/templates/',
  '/categories/',
  '/categories/outdoor/',
  '/features/',
  '/features/template-builder/',
  '/login/',
  '/register/',
  '/profile/serp/',
  '/profile/serp/ultimate-camping-checklist/',
];
const FILES = ['/robots.txt', '/sitemap.xml', '/sitemaps/pages/1.xml', '/og-default.png'];

test.describe('URL form', () => {
  test('@smoke canonical pages and files answer 200 without a redirect', async ({ request }) => {
    for (const path of [...PAGES, ...FILES]) {
      expect((await get(request, path)).status(), path).toBe(200);
    }
  });

  test('@smoke a page without its slash and a file with one move to the canonical URL in one hop', async ({ request }) => {
    for (const page of PAGES.filter((path) => path !== '/')) {
      const response = await get(request, page.slice(0, -1));
      expect(response.status(), page).toBe(308);
      expect(locationOf(response), page).toBe(`${APP_URL}${page}`);
    }
    for (const file of FILES) {
      const response = await get(request, `${file}/`);
      expect(response.status(), file).toBe(308);
      expect(locationOf(response), file).toBe(`${APP_URL}${file}`);
    }
    const withQuery = await get(request, '/login?next=%2Fdashboard%2Ftemplates%2F');
    expect(withQuery.status()).toBe(308);
    expect(locationOf(withQuery)).toBe(`${APP_URL}/login/?next=%2Fdashboard%2Ftemplates%2F`);
  });

  // Better Auth, the Stripe webhook and agents (MCP) call these paths directly, and do not
  // follow redirects.
  test('@smoke the API answers at the path it is called with, with or without a slash', async ({ request }) => {
    for (const path of ['/api/health', '/api/auth/get-session', '/api/mcp', '/api/stripe/webhook', '/api/uploads/file']) {
      for (const form of [path, `${path}/`]) {
        const status = (await get(request, form)).status();
        expect(status >= 300 && status < 400, `${form} answered ${status}`).toBe(false);
      }
    }
    expect((await get(request, '/api/health')).status()).toBe(200);
    const webhook = await request.post(`${APP_URL}/api/stripe/webhook`, { data: '{}', maxRedirects: 0 });
    expect(webhook.status() >= 300 && webhook.status() < 400, `webhook answered ${webhook.status()}`).toBe(false);
  });

  test('public pages link only to canonical URLs, which answer without a redirect', async ({ request }) => {
    const links = new Set<string>();
    for (const page of ['/', '/templates/', '/categories/', '/features/', '/pricing/', '/about/', '/contact/', '/login/']) {
      const html = await (await get(request, page)).text();
      for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="(\/(?!\/)[^"#]*)/g)) links.add(href.replaceAll('&amp;', '&'));
    }
    expect(links.size).toBeGreaterThan(10);
    for (const link of links) {
      expect((await get(request, link)).status(), link).toBe(200);
    }
  });

  test('moving around the public site never goes through a redirect', async ({ page }) => {
    const redirects: string[] = [];
    page.on('response', (response) => {
      if (response.url().startsWith(APP_URL) && [301, 302, 303, 307, 308].includes(response.status())) {
        redirects.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto('/');
    const header = page.getByRole('banner');
    // "Templates" and "Features" open menus of their pages (in a popup outside the header).
    const openMenu = page.locator('[data-slot="navigation-menu-content"][data-open]');
    for (const [menu, name, path] of [
      ['Templates', 'Template Library', '/templates/'],
      ['Templates', 'Categories', '/categories/'],
      ['Features', 'Template Builder', '/features/template-builder/'],
      ['Features', 'Import + Export', '/features/import-export/'],
    ] as const) {
      await header.getByRole('button', { name: menu, exact: true }).click();
      await openMenu.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(`${APP_URL}${path}`);
    }
    await header.getByRole('link', { name: 'Pricing', exact: true }).click();
    await expect(page).toHaveURL(`${APP_URL}/pricing/`);
    const footer = page.getByRole('contentinfo');
    for (const [name, path] of [
      ['Template Library', '/templates/'],
      ['Categories', '/categories/'],
      ['About', '/about/'],
      ['Contact', '/contact/'],
    ] as const) {
      await footer.getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(`${APP_URL}${path}`);
    }
    await page.getByRole('banner').getByRole('link', { name: 'Get started', exact: true }).click();
    await expect(page).toHaveURL(`${APP_URL}/register/`);
    expect(redirects).toEqual([]);
  });
});

test.describe('production environment', () => {
  test('lets crawlers in: robots.txt allows crawling and lists the sitemap, and nothing is noindex', async ({ request }) => {
    const robots = await (await get(request, '/robots.txt')).text();
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toMatch(/^Sitemap: https:\/\/serplists\.com\/sitemap\.xml$/m);
    for (const path of ['/', '/templates/', '/profile/serp/ultimate-camping-checklist/', '/api/health', '/og-default.png']) {
      expect((await get(request, path)).headers()['x-robots-tag'], path).toBeUndefined();
    }
    // A share link's page is one person's run, never indexed, on production too.
    expect((await get(request, '/share/e2e-no-such-share/')).headers()['x-robots-tag']).toBe('noindex, nofollow');
  });

  test('public template pages name their canonical URL on serplists.com', async ({ page }) => {
    const response = await page.goto('/profile/serp/ultimate-camping-checklist/?utm_source=e2e');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' }),
    ).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://serplists.com/profile/serp/ultimate-camping-checklist/',
    );
    expect(response?.headers()['x-robots-tag']).toBeUndefined();
  });

  // Each environment answers on one host. The Worker's workers.dev URL and www serve the same
  // deployment, so they redirect to serplists.com in one hop, in the canonical form. CI tests a
  // deployment on its workers.dev URL with the smoke-test header, which skips that redirect.
  test('@smoke other hosts redirect to serplists.com in one hop, and the smoke-test header serves workers.dev', async ({ request }) => {
    const workersDev = 'serp-checklists-production.serp.workers.dev';
    for (const [host, path, canonical] of [
      [workersDev, '/about', 'https://serplists.com/about/'],
      [workersDev, '/about/', 'https://serplists.com/about/'],
      [workersDev, '/robots.txt/', 'https://serplists.com/robots.txt'],
      [workersDev, '/profile/serp/ultimate-camping-checklist', 'https://serplists.com/profile/serp/ultimate-camping-checklist/'],
      [workersDev, '/api/mcp', 'https://serplists.com/api/mcp'],
      ['www.serplists.com', '/', 'https://serplists.com/'],
      ['www.serplists.com', '/pricing', 'https://serplists.com/pricing/'],
    ] as const) {
      const response = await get(request, path, { host });
      expect(response.status(), `${host}${path}`).toBe(308);
      expect(locationOf(response), `${host}${path}`).toBe(canonical);
    }

    const smokeTest = await get(request, '/about/', { host: workersDev, [SMOKE_TEST_HEADER]: '1' });
    expect(smokeTest.status()).toBe(200);
    const smokeTestApi = await get(request, '/api/health', { host: workersDev, [SMOKE_TEST_HEADER]: '1' });
    expect(smokeTestApi.status()).toBe(200);
  });
});
