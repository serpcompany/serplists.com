import { expect, test, type Page } from '@playwright/test';

import { PAST_THE_TEAMS_LIST_STALE_TIME, returnToTabAfter } from './support/navigation';
import { ACME_ORG_OWNED, FREE_BILLING_STATUS, fulfillJson, OWNER_SESSION, routeTheApi } from './support/mocked-api';

async function mockApi(page: Page) {
  const teamsRequests: string[] = [];
  await routeTheApi(page, async ({ route, request, path }) => {
    if (path === '/api/auth/get-session') {
      await fulfillJson(route, OWNER_SESSION);
      return;
    }
    if (path === '/api/teams' && request.method() === 'GET') {
      teamsRequests.push(path);
      await fulfillJson(route, ACME_ORG_OWNED);
      return;
    }
    if (path === '/api/billing/status') {
      await fulfillJson(route, FREE_BILLING_STATUS);
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
