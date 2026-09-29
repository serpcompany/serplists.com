import { expect, test, type Page, type Route } from '@playwright/test';

// Account Settings profile form against a mocked API, so it does not depend on
// R2 uploads or change seeded users.

const AVATAR_URL = 'https://avatars.e2e.test/new-avatar.png';
// 1x1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

async function mockProfileApi(page: Page) {
  const user = {
    id: 'user-profile',
    email: 'profile@example.com',
    emailVerified: true,
    name: 'John',
    username: 'john',
    image: null as string | null,
  };
  const updateRequests: unknown[] = [];

  await page.route('https://avatars.e2e.test/**', (route) =>
    route.fulfill({ body: PNG_BYTES, contentType: 'image/png' }),
  );

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (path === '/api/auth/get-session' && method === 'GET') {
      await fulfillJson(route, {
        session: {
          id: 'session-profile',
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-07-08T00:00:00.000Z',
          token: 'profile-session-token',
          updatedAt: '2026-07-01T00:00:00.000Z',
          userId: user.id,
        },
        user: { ...user },
      });
      return;
    }

    if (path === '/api/auth/update-user' && method === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      updateRequests.push(body);
      if ('image' in body) user.image = (body.image as string | null) ?? null;
      if (typeof body.name === 'string') user.name = body.name;
      if (typeof body.username === 'string') user.username = body.username.toLowerCase();
      await fulfillJson(route, { status: true });
      return;
    }

    if (path === '/api/uploads' && method === 'POST') {
      await fulfillJson(route, { key: 'avatars/new-avatar.png', url: AVATAR_URL });
      return;
    }

    if (path === '/api/billing/status') {
      await fulfillJson(route, { billingEnabled: false, plan: 'free' });
      return;
    }

    if (
      method === 'GET' &&
      ['/api/teams', '/api/agent-keys', '/api/templates', '/api/checklists'].some((prefix) =>
        path.startsWith(prefix),
      )
    ) {
      await fulfillJson(route, []);
      return;
    }

    await route.continue();
  });

  return { updateRequests };
}

test.describe('account profile form', () => {
  test('an avatar upload keeps unsaved name and username edits', async ({ page }) => {
    const api = await mockProfileApi(page);
    await page.goto('/dashboard/settings/');

    const fullName = page.locator('#fullName');
    const username = page.locator('#username');
    await expect(fullName).toHaveValue('John', { timeout: 15_000 });
    await fullName.fill('John Smith');
    await username.fill('johnsmith');

    const fileChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload avatar' }).click();
    await (await fileChooser).setFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_BYTES,
    });
    await expect(page.getByText('Avatar updated successfully!')).toBeVisible({ timeout: 15_000 });

    await expect(fullName).toHaveValue('John Smith');
    await expect(username).toHaveValue('johnsmith');

    await page.getByRole('button', { name: 'Update Profile' }).click();
    await expect(page.getByText('Profile updated successfully')).toBeVisible();
    expect(api.updateRequests.at(-1)).toEqual({ name: 'John Smith', username: 'johnsmith' });
  });

  test('clearing a saved username is refused instead of reported as saved', async ({ page }) => {
    const api = await mockProfileApi(page);
    await page.goto('/dashboard/settings/');

    const username = page.locator('#username');
    await expect(username).toHaveValue('john', { timeout: 15_000 });
    await username.fill('');
    await page.getByRole('button', { name: 'Update Profile' }).click();

    await expect(page.getByText("Username can't be removed. Enter a new username instead.")).toBeVisible();
    await expect(page.getByText('Profile updated successfully')).toHaveCount(0);
    expect(api.updateRequests).toEqual([]);
  });
});
