import { expect, test, type Page, type Route } from '@playwright/test';

// A failed teams request says nothing about membership. An Organization user whose teams
// request fails sees an error with Retry, never a silent switch to Personal
// (src/contexts/workspaceSelection.ts).

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

async function mockApi(page: Page, state: { teamsFail: boolean }) {
  const scopedListRequests: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path === '/api/auth/get-session') {
      await fulfillJson(route, {
        session: {
          id: 'session-1',
          createdAt: '2026-07-01T00:00:00.000Z',
          expiresAt: '2026-07-08T00:00:00.000Z',
          token: 'session-token',
          updatedAt: '2026-07-01T00:00:00.000Z',
          userId: 'user-owner',
        },
        user: { id: 'user-owner', email: 'owner@example.com', emailVerified: true, name: 'Owner User', username: 'owner' },
      });
      return;
    }
    if (path === '/api/teams' && request.method() === 'GET') {
      if (state.teamsFail) {
        await fulfillJson(route, { error: 'Internal error' }, 500);
        return;
      }
      await fulfillJson(route, [
        { id: 'team-1', memberId: 'member-1', membershipStatus: 'active', name: 'Acme Org', role: 'owner', slug: 'acme' },
      ]);
      return;
    }
    if (path === '/api/templates' && request.method() === 'GET') {
      scopedListRequests.push(url.search);
      await fulfillJson(route, []);
      return;
    }
    if (path === '/api/billing/status') {
      await fulfillJson(route, { billingEnabled: true, plan: 'free' });
      return;
    }
    await fulfillJson(route, []);
  });
  return scopedListRequests;
}

test('a failed teams request shows an error instead of switching to Personal', async ({ page }) => {
  const state = { teamsFail: true };
  const templateListRequests = await mockApi(page, state);
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1'));

  await page.goto('/dashboard/templates');

  await expect(page.getByText("Couldn't load your Organizations")).toBeVisible({ timeout: 30_000 });
  const switcher = page.getByRole('button', { name: 'Switch context' }).first();
  await expect(switcher).toContainText('Organizations unavailable');
  await expect(switcher).not.toContainText('Personal');
  // Nothing loads for Personal while the Organization is unconfirmed.
  expect(templateListRequests.filter((search) => search.includes('scope=personal'))).toEqual([]);

  state.teamsFail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();

  await expect(switcher).toContainText('Acme Org');
  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('team-1');
});

test('Continue in Personal leaves the error for Personal', async ({ page }) => {
  await mockApi(page, { teamsFail: true });
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1'));

  await page.goto('/dashboard/templates');
  await page.getByRole('button', { name: 'Continue in Personal' }).click({ timeout: 30_000 });

  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Personal');
  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
});
