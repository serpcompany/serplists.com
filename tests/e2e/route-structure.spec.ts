import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, apiJson } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';
import { fulfillJson, routeTheApi } from './support/mocked-api';

const PRODUCTION_ORIGIN = 'https://serplists.com';
const CONSOLE_HOME_URL = /\/dashboard\/templates\/$/;
const MISSING_PROFILE_PATH = '/profile/no-such-user-route-structure/';
const MISSING_TEMPLATE_PATH = `${MISSING_PROFILE_PATH}no-such-template/`;
const SEEDED_PUBLIC_TEMPLATE_PATH = '/profile/admin/sample-technical-seo-audit-checklist/';

async function serveLocalAppAsProduction(page: Page) {
  const pagesOrigin = new URL(API_BASE_URL).origin;
  await page.routeWebSocket(/.*/, (webSocket) => webSocket.close());
  await page.route(/.*/, async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== PRODUCTION_ORIGIN) {
      await route.abort();
      return;
    }
    const localUrl = new URL(`${url.pathname}${url.search}`, pagesOrigin).href;
    await route.fulfill({ response: await route.fetch({ url: localUrl }) });
  });
}

async function expectRobots(page: Page, expected: string | RegExp) {
  const tags = page.locator('meta[name="robots"]');
  await expect(tags.first()).toHaveAttribute('content', expected);
  for (const content of await tags.evaluateAll((elements) => elements.map((element) => element.getAttribute('content')))) {
    expect(content).toMatch(typeof expected === 'string' ? new RegExp(`^${expected}$`) : expected);
  }
}

async function mockAuthenticatedRouteApi(page: Page) {
  await routeTheApi(page, async ({ route, request, path }) => {
    if (path === '/api/auth/get-session' && request.method() === 'GET') {
      await fulfillJson(route, {
        session: {
          id: 'session-route-structure',
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-07-08T00:00:00.000Z',
          token: 'route-structure-session-token',
          updatedAt: '2026-07-01T00:00:00.000Z',
          userId: 'user-route-structure',
        },
        user: {
          id: 'user-route-structure',
          email: 'route@example.com',
          emailVerified: true,
          name: 'Route Structure User',
          username: 'routeuser',
        },
      });
      return;
    }

    if (path === '/api/teams' && request.method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if ((path === '/api/templates' || path === '/api/checklists') && request.method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (path === '/api/billing/status' && request.method() === 'GET') {
      await fulfillJson(route, {
        billingEnabled: true,
        plan: 'free',
      });
      return;
    }

    await route.continue();
  });
}

async function reportFreeThenProBillingStatus(page: Page) {
  let statusReads = 0;
  await page.route('**/api/billing/status**', async (route) => {
    statusReads += 1;
    await fulfillJson(route, {
      billingEnabled: true,
      plan: statusReads >= 2 ? 'pro' : 'free',
      subscriptionStatus: statusReads >= 2 ? 'active' : null,
      canManageBilling: true,
      managedBySupport: false,
    });
  });
}

async function failBrowserTemplateReads(page: Page) {
  await page.route('**/api/templates/slug/**', (route) =>
    fulfillJson(route, { error: 'Service unavailable' }, 503),
  );
}

async function expectLoadedPage(page: Page, heading: string, content: string) {
  await expect(
    page.getByRole('heading', { exact: true, name: heading }).first(),
  ).toBeVisible();
  await expect(page.getByText(content, { exact: true }).first()).toBeVisible();
}

test.describe('route structure', () => {
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('canonical feature, library, and category detail routes render', async ({
    page,
  }) => {
    await page.goto('/templates/');
    await expect(
      page.getByRole('heading', {
        name: 'Template Library',
      }),
    ).toBeVisible();

    await page.goto('/features/template-builder/');
    await expect(
      page.getByRole('heading', { name: 'Template Builder' }),
    ).toBeVisible();

    await page.goto('/categories/outdoor/');
    await expect(
      page.getByRole('heading', { name: 'outdoor' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ultimate Camping Checklist' }),
    ).toBeVisible();
  });

  test('legacy public routes redirect to the live canonical library path', async ({
    page,
  }) => {
    await page.goto('/templates/');
    await expect(page).toHaveURL(/\/templates\/$/);

    await page.goto('/checklists');
    await expect(page).toHaveURL(/\/templates\/$/);
  });

  test('legacy console routes redirect to the live canonical dashboard path', async ({
    page,
  }) => {
    await mockAuthenticatedRouteApi(page);

    await page.goto('/console');
    await expect(page).toHaveURL(CONSOLE_HOME_URL);

    await page.goto('/account');
    await expect(page).toHaveURL(/\/dashboard\/settings\/$/);

    await page.goto('/dashboard/profile');
    await expect(page).toHaveURL(/\/dashboard\/settings\/$/);
  });

  test("a Run's old address answers one 308 with its one URL, keeping the query", async ({ request }) => {
    for (const path of ['/run/run-1?from=email', '/run/run-1/?from=email']) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(308);
      const location = new URL(response.headers().location ?? '', API_BASE_URL);
      expect(`${location.pathname}${location.search}`, path).toBe('/dashboard/runs/run-1/?from=email');
    }
  });

  test('legacy redirects keep the query string and hash', async ({ page }) => {
    await mockAuthenticatedRouteApi(page);

    await page.goto('/dashboard/profile?foo=1#top');
    await expect(page).toHaveURL(/\/dashboard\/settings\/\?foo=1#top$/);

    await page.goto('/account?billing=cancel');
    await expect(page.getByText('Upgrade canceled.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/settings\/$/);
  });

  test('returning from Checkout through /account confirms Pro once it activates', async ({ page }) => {
    await mockAuthenticatedRouteApi(page);
    await reportFreeThenProBillingStatus(page);

    await page.goto('/account?billing=success');
    await expect(page.getByText('Welcome to Pro!')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard\/settings\/$/);
  });

  test('canonical dashboard resolves to the templates dashboard surface', async ({
    page,
  }) => {
    await mockAuthenticatedRouteApi(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(CONSOLE_HOME_URL);
  });

  test('removed mixed-surface routes still return not found', async ({ page }) => {
    await page.goto('/templates/new/');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();

    await page.goto('/templates/template-1/');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();

    await page.goto('/templates/template-1/edit/');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();
  });

  test('a missing console page is a public 404 for a visitor and a console 404 once signed in, without a hydration error', async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydrat|#418|#423|#425/i.test(message.text())) {
        hydrationErrors.push(message.text());
      }
    });
    const heading = page.getByRole('heading', { name: 'That page does not exist' });
    const consoleNavigation = page.getByRole('navigation', { name: 'Dashboard' });

    const missing = await page.goto('/dashboard/definitely-missing/');
    expect(missing?.status()).toBe(404);
    await expect(heading).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
    await expect(consoleNavigation).toHaveCount(0);

    await loginAsAdmin(page);
    await page.goto('/dashboard/definitely-missing/');
    await expect(heading).toBeVisible();
    await expect(consoleNavigation).toBeVisible();
    await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible();
    expect(hydrationErrors).toEqual([]);
  });

  test('missing pages are noindexed, unknown categories and features included', async ({ page }) => {
    await serveLocalAppAsProduction(page);
    for (const path of [
      '/definitely-missing/',
      '/categories/definitely-missing/',
      '/features/definitely-missing/',
    ]) {
      await page.goto(`${PRODUCTION_ORIGIN}${path}`);
      await expect(
        page.getByRole('heading', { name: 'That page does not exist' }),
      ).toBeVisible();
      await expectRobots(page, /noindex/);
    }
  });

  test('real category and feature pages stay indexable once loaded', async ({ page }) => {
    await serveLocalAppAsProduction(page);
    for (const [path, heading, content] of [
      ['/categories/outdoor/', 'outdoor', 'Ultimate Camping Checklist'],
      ['/categories/seo/', 'SEO', 'Technical SEO Audit Checklist'],
      ['/features/template-builder/', 'Template Builder', 'Build reusable SOPs with sections and tasks.'],
    ] as const) {
      await page.goto(`${PRODUCTION_ORIGIN}${path}`);
      await expectLoadedPage(page, heading, content);
      await expect(
        page.getByRole('heading', { name: 'That page does not exist' }),
      ).toHaveCount(0);
      await expect(
        page.locator('meta[name="robots"][content*="noindex"]'),
      ).toHaveCount(0);
    }
  });

  test('a registry category no public Template uses yet stays out of the index', async ({ page }) => {
    await serveLocalAppAsProduction(page);
    await page.goto(`${PRODUCTION_ORIGIN}/categories/business/`);
    await expect(
      page.getByRole('heading', { exact: true, name: 'Business & Operations' }),
    ).toBeVisible();
    await expect(page.getByText('No public templates in this category yet.')).toBeVisible();
    await expectRobots(page, 'noindex, follow');
  });

  test('shared checklist pages use /share and render noindex,nofollow', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await loginAsAdmin(page);

    const createdRun = await apiJson<{ id?: string }>(page, '/checklists', {
      method: 'POST',
      body: {
        title: 'Share Route Verification',
        items: [{ id: 'item-1', title: 'Confirm canonical share route' }],
        status: 'in_progress',
      },
    });
    if (!createdRun.id) {
      throw new Error('Run id missing from API response');
    }
    const { shareToken } = await apiJson<{ shareToken?: string }>(
      page,
      `/checklists/run/${createdRun.id}/share`,
      { method: 'POST', body: {} },
    );
    if (!shareToken) {
      throw new Error('Share token missing from API response');
    }

    await serveLocalAppAsProduction(page);
    await page.goto(`${PRODUCTION_ORIGIN}/share/${shareToken}/`);

    await expect(page).toHaveURL(new RegExp(`/share/${shareToken}/$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Share Route Verification' }),
    ).toBeVisible();
    await expectRobots(page, 'noindex, nofollow');
  });

  test('missing public profiles and templates render noindex,nofollow', async ({
    page,
  }) => {
    await serveLocalAppAsProduction(page);
    await page.route('**/api/profiles/by-username**', (route) =>
      fulfillJson(route, { error: 'Profile not found' }, 404),
    );
    await page.route('**/api/templates/slug/**', (route) =>
      fulfillJson(route, { error: 'Template not found' }, 404),
    );

    await page.goto(`${PRODUCTION_ORIGIN}${MISSING_PROFILE_PATH}`);
    await expect(
      page.getByRole('heading', { name: 'User not found' }),
    ).toBeVisible();
    await expectRobots(page, 'noindex, nofollow');
    await expect(page).toHaveTitle(/Profile not found/);

    await page.goto(`${PRODUCTION_ORIGIN}${MISSING_TEMPLATE_PATH}`);
    await expect(
      page.getByRole('heading', { name: 'Template not found' }),
    ).toBeVisible();
    await expectRobots(page, 'noindex, nofollow');
    await expect(page).toHaveTitle(/Template not found/);
  });

  test('a public template that fails to load stays indexable', async ({
    page,
  }) => {
    await serveLocalAppAsProduction(page);
    await failBrowserTemplateReads(page);

    await page.goto(`${PRODUCTION_ORIGIN}${SEEDED_PUBLIC_TEMPLATE_PATH}`);
    await expect(
      page.getByRole('heading', { name: 'Unable to load template' }),
    ).toBeVisible();
    await expectRobots(page, 'index, follow');
  });
});
