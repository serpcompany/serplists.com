import { expect, test, type APIRequestContext } from '@playwright/test';

import { SMOKE_TEST_HEADER } from '../../scripts/check-site-standards.mjs';
import { capturedGroup } from '../support/elements';
import { APP_URL } from './support/stack';

const get = (request: APIRequestContext, path: string, headers: Record<string, string> = {}) =>
  request.get(`${APP_URL}${path}`, { headers, maxRedirects: 0 });

const redirectTargetOf = (response: { headers(): Record<string, string> }, base = APP_URL) =>
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
      expect(redirectTargetOf(response), page).toBe(`${APP_URL}${page}`);
    }
    for (const file of FILES) {
      const response = await get(request, `${file}/`);
      expect(response.status(), file).toBe(308);
      expect(redirectTargetOf(response), file).toBe(`${APP_URL}${file}`);
    }
    const withQuery = await get(request, '/login?next=%2Fdashboard%2Ftemplates%2F');
    expect(withQuery.status()).toBe(308);
    expect(redirectTargetOf(withQuery)).toBe(`${APP_URL}/login/?next=%2Fdashboard%2Ftemplates%2F`);
  });

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
      for (const link of html.matchAll(/<a\b[^>]*\bhref="(\/(?!\/)[^"#]*)/g)) {
        links.add(capturedGroup(link, 1).replaceAll('&amp;', '&'));
      }
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
    const openMenuPopupAfterThePage = page.locator('[data-slot="navigation-menu-content"][data-open]');
    for (const [menu, name, path] of [
      ['Templates', 'Template Library', '/templates/'],
      ['Templates', 'Categories', '/categories/'],
      ['Features', 'Template Builder', '/features/template-builder/'],
      ['Features', 'Import + Export', '/features/import-export/'],
    ] as const) {
      await header.getByRole('button', { name: menu, exact: true }).click();
      await openMenuPopupAfterThePage.getByRole('link', { name, exact: true }).click();
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
  test('lets crawlers in: robots.txt allows crawling and lists the sitemap, and only share pages are noindex', async ({ request }) => {
    const robots = await (await get(request, '/robots.txt')).text();
    expect(robots).toMatch(/^Allow: \/$/m);
    expect(robots).not.toMatch(/^Disallow: \/$/m);
    expect(robots).toMatch(/^Sitemap: https:\/\/serplists\.com\/sitemap\.xml$/m);
    for (const path of ['/', '/templates/', '/profile/serp/ultimate-camping-checklist/', '/api/health', '/og-default.png']) {
      expect((await get(request, path)).headers()['x-robots-tag'], path).toBeUndefined();
    }
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
      expect(redirectTargetOf(response), `${host}${path}`).toBe(canonical);
    }

    const smokeTest = await get(request, '/about/', { host: workersDev, [SMOKE_TEST_HEADER]: '1' });
    expect(smokeTest.status()).toBe(200);
    const smokeTestApi = await get(request, '/api/health', { host: workersDev, [SMOKE_TEST_HEADER]: '1' });
    expect(smokeTestApi.status()).toBe(200);
  });
});
