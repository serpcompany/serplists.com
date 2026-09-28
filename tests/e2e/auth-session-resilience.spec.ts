import { expect, test, type Page, type Route } from '@playwright/test';

// A failed session check (5xx, 429, network) is not a sign-out: the user keeps their page and
// their stored Organization, and gets a retry instead of /login (src/contexts/authSession.ts).

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

const sessionBody = {
  session: {
    id: 'session-1',
    createdAt: '2026-07-01T00:00:00.000Z',
    expiresAt: '2026-07-08T00:00:00.000Z',
    token: 'session-token',
    updatedAt: '2026-07-01T00:00:00.000Z',
    userId: 'user-owner',
  },
  user: { id: 'user-owner', email: 'owner@example.com', emailVerified: true, name: 'Owner User', username: 'owner' },
};

async function mockApi(page: Page, sessionAvailable: { value: boolean }) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/auth/get-session') {
      if (sessionAvailable.value) {
        await fulfillJson(route, sessionBody);
      } else {
        await fulfillJson(route, { error: 'Service unavailable' }, 503);
      }
      return;
    }
    if (path === '/api/teams' && request.method() === 'GET') {
      await fulfillJson(route, [
        { id: 'team-1', memberId: 'member-1', membershipStatus: 'active', name: 'Acme Org', role: 'owner', slug: 'acme' },
      ]);
      return;
    }
    if (path === '/api/billing/status') {
      await fulfillJson(route, { billingEnabled: true, plan: 'free' });
      return;
    }
    await fulfillJson(route, []);
  });
}

test('a failing session check keeps the page and the Organization, then recovers on retry', async ({ page }) => {
  const sessionAvailable = { value: true };
  await mockApi(page, sessionAvailable);

  await page.goto('/dashboard/runs');
  await page.evaluate(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1'));

  sessionAvailable.value = false;
  await page.reload();

  await expect(page.getByText(/Can't reach/)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard\/runs$/);
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('team-1');

  sessionAvailable.value = true;
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Acme Org', {
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/dashboard\/runs$/);
});
