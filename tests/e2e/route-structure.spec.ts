import { expect, test, type Page, type Route } from '@playwright/test';

const API_BASE_URL = process.env.VITE_API_URL ?? 'http://localhost:8788/api';
const PRODUCTION_ORIGIN = 'https://serplists.com';

/**
 * SEOHead noindexes every host but serplists.com (src/lib/seo/siteOrigin.ts), so a
 * page's own robots rule only shows on the production host. This serves the local
 * wrangler Pages server (the built app, its page functions and the API, all on one
 * origin like production) as https://serplists.com, and aborts every other request
 * (analytics, fonts), so nothing reaches the real site or reports a visit to it.
 * Register page mocks after this, so they answer first.
 */
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

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  });
}

async function mockAuthenticatedRouteApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

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

    if (path === '/api/templates' && request.method() === 'GET') {
      await fulfillJson(route, []);
      return;
    }

    if (path === '/api/checklists' && request.method() === 'GET') {
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

async function signInAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: /fill admin/i }).click();
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings$/, { timeout: 30_000 });
}

test.describe('route structure', () => {
  // serveLocalAppAsProduction answers the page's requests itself; let any still in
  // flight go when the page closes.
  test.afterEach(async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('canonical feature, library, and category detail routes render', async ({
    page,
  }) => {
    await page.goto('/templates');
    await expect(
      page.getByRole('heading', {
        name: 'Discover Templates',
      }),
    ).toBeVisible();

    await page.goto('/features/template-builder');
    await expect(
      page.getByRole('heading', { name: 'Template Builder' }),
    ).toBeVisible();

    await page.goto('/categories/outdoor');
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
    await page.goto('/templates');
    await expect(page).toHaveURL(/\/templates$/);

    await page.goto('/checklists');
    await expect(page).toHaveURL(/\/templates$/);
  });

  test('legacy console routes redirect to the live canonical dashboard path', async ({
    page,
  }) => {
    await mockAuthenticatedRouteApi(page);

    await page.goto('/console');
    await expect(page).toHaveURL(/\/dashboard\/templates$/);

    await page.goto('/account');
    await expect(page).toHaveURL(/\/dashboard\/settings$/);

    await page.goto('/dashboard/profile');
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
  });

  test('legacy redirects keep the query string and hash', async ({ page }) => {
    await mockAuthenticatedRouteApi(page);

    await page.goto('/dashboard/profile?foo=1#top');
    await expect(page).toHaveURL(/\/dashboard\/settings\?foo=1#top$/);

    await page.goto('/account?billing=cancel');
    await expect(page.getByText('Upgrade canceled.')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
  });

  test('returning from Checkout through /account confirms Pro once it activates', async ({ page }) => {
    await mockAuthenticatedRouteApi(page);
    let statusReads = 0;
    // Registered last, so it answers before the generic mock: Free first, then Pro.
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

    await page.goto('/account?billing=success');
    await expect(page.getByText('Welcome to Pro!')).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
  });

  test('canonical dashboard resolves to the templates dashboard surface', async ({
    page,
  }) => {
    await mockAuthenticatedRouteApi(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/templates$/);
  });

  test('removed mixed-surface routes still return not found', async ({ page }) => {
    await page.goto('/templates/new');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();

    await page.goto('/templates/template-1');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();

    await page.goto('/templates/template-1/edit');
    await expect(
      page.getByRole('heading', { name: 'That page does not exist' }),
    ).toBeVisible();
  });

  test('not-found pages are noindexed and real pages are not', async ({ page }) => {
    // Pages answers unknown paths with index.html and a 200, so the robots tag is the
    // only thing that keeps a missing URL out of search results.
    await serveLocalAppAsProduction(page);
    for (const path of [
      '/definitely-missing',
      '/categories/definitely-missing',
      '/features/definitely-missing',
    ]) {
      await page.goto(`${PRODUCTION_ORIGIN}${path}`);
      await expect(
        page.getByRole('heading', { name: 'That page does not exist' }),
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        'content',
        /noindex/,
      );
    }

    // Each page's own content shows it finished loading before its robots tag is read.
    for (const [path, heading, content] of [
      ['/categories/outdoor', 'outdoor', 'Ultimate Camping Checklist'],
      ['/categories/seo', 'SEO', 'Technical SEO Audit Checklist'],
      ['/features/template-builder', 'Template Builder', 'Build reusable SOPs with sections and tasks.'],
    ] as const) {
      await page.goto(`${PRODUCTION_ORIGIN}${path}`);
      await expect(
        page.getByRole('heading', { exact: true, name: heading }).first(),
      ).toBeVisible();
      await expect(page.getByText(content, { exact: true }).first()).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'That page does not exist' }),
      ).toHaveCount(0);
      await expect(
        page.locator('meta[name="robots"][content*="noindex"]'),
      ).toHaveCount(0);
    }

    // A registry category no public Template uses yet is a real page, but it stays out
    // of the index (and the sitemap) until a Template uses it.
    await page.goto(`${PRODUCTION_ORIGIN}/categories/business`);
    await expect(
      page.getByRole('heading', { exact: true, name: 'Business & Operations' }),
    ).toBeVisible();
    await expect(page.getByText('No public templates in this category yet.')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, follow',
    );
  });

  test('shared checklist pages use /share and render noindex,nofollow', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await signInAsAdmin(page);

    const shareToken = await page.evaluate(async (apiBase) => {
      const createRunResponse = await fetch(`${apiBase}/checklists`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Share Route Verification',
          items: [{ id: 'item-1', title: 'Confirm canonical share route' }],
          status: 'in_progress',
        }),
      });

      if (!createRunResponse.ok) {
        throw new Error(`Unable to create run: ${createRunResponse.status}`);
      }

      const createdRun = (await createRunResponse.json()) as { id?: string };

      if (!createdRun.id) {
        throw new Error('Run id missing from API response');
      }

      const response = await fetch(
        `${apiBase}/checklists/run/${createdRun.id}/share`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error(`Unable to create share token: ${response.status}`);
      }

      const data = (await response.json()) as { shareToken?: string };

      if (!data.shareToken) {
        throw new Error('Share token missing from API response');
      }

      return data.shareToken;
    }, API_BASE_URL);

    await serveLocalAppAsProduction(page);
    await page.goto(`${PRODUCTION_ORIGIN}/share/${shareToken}`);

    await expect(page).toHaveURL(new RegExp(`/share/${shareToken}$`));
    await expect(
      page.getByRole('heading', { level: 1, name: 'Share Route Verification' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
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

    await page.goto(`${PRODUCTION_ORIGIN}/profile/no-such-user-route-structure`);
    await expect(
      page.getByRole('heading', { name: 'User not found' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page).toHaveTitle(/Profile not found/);

    await page.goto(`${PRODUCTION_ORIGIN}/profile/no-such-user-route-structure/no-such-template`);
    await expect(
      page.getByRole('heading', { name: 'Template not found' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page).toHaveTitle(/Template not found/);
  });

  test('a public template that fails to load stays indexable', async ({
    page,
  }) => {
    await serveLocalAppAsProduction(page);
    await page.route('**/api/templates/slug/**', (route) =>
      fulfillJson(route, { error: 'Service unavailable' }, 503),
    );

    await page.goto(`${PRODUCTION_ORIGIN}/profile/route-structure-owner/some-template`);
    await expect(
      page.getByRole('heading', { name: 'Unable to load template' }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'index, follow',
    );
  });
});
