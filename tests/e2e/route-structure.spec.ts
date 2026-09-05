import { expect, test, type Page, type Route } from '@playwright/test';

const API_BASE_URL = process.env.VITE_API_URL ?? 'http://localhost:8788/api';

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
  await page.locator('#email').fill('admin@test.com');
  await page.locator('#password').fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings$/, { timeout: 30_000 });
}

test.describe('route structure', () => {
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

    await page.goto(`/share/${shareToken}`);

    await expect(page).toHaveURL(new RegExp(`/share/${shareToken}$`));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });
});
