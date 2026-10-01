import { expect, test, type Page, type Route } from '@playwright/test';

import { PAST_THE_TEAMS_LIST_STALE_TIME, returnToTabAfter } from './support/navigation';

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ body: JSON.stringify(body), contentType: 'application/json', status });
}

async function mockApi(page: Page) {
  const teamsRequests: string[] = [];
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
      teamsRequests.push(path);
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
  return teamsRequests;
}

test('a Personal tab stays Personal after another tab selects an Organization', async ({ context }) => {
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  await mockApi(tabA);
  const tabBTeamsRequests = await mockApi(tabB);
  await tabB.clock.install();

  await tabB.goto('/dashboard/templates/');
  await tabB.evaluate(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'personal'));
  await tabB.reload();
  const switcherB = tabB.getByRole('button', { name: 'Switch context' }).first();
  await expect(switcherB).toContainText('Personal', { timeout: 30_000 });

  await tabA.goto('/dashboard/templates/');
  await tabA.getByRole('button', { name: 'Switch context' }).first().click();
  await tabA.getByRole('menuitem', { name: /Acme Org/ }).click();
  await expect(tabA.getByRole('button', { name: 'Switch context' }).first()).toContainText('Acme Org');

  const requestsBefore = tabBTeamsRequests.length;
  await returnToTabAfter(tabB, PAST_THE_TEAMS_LIST_STALE_TIME);
  await expect.poll(() => tabBTeamsRequests.length).toBeGreaterThan(requestsBefore);

  await expect(switcherB).toContainText('Personal');
  await expect(switcherB).not.toContainText('Acme Org');
});
