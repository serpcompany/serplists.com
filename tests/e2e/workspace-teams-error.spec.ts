import { expect, test, type Page } from '@playwright/test';
import { ACME_ORG_OWNED, FREE_BILLING_STATUS, fulfillJson, OWNER_SESSION, routeTheApi } from './support/mocked-api';

const organizationRun = {
  id: 'run-org',
  title: 'Org Run',
  template_id: 'tpl-org',
  items: JSON.stringify([{ id: 'sec-1', title: 'Section', items: [{ id: 'task-a', title: 'Task A' }] }]),
  status: 'in_progress',
  is_public: 0,
  team_id: 'team-1',
  user_id: 'user-owner',
  revision: 1,
  started_at: '2026-07-02T00:00:00.000Z',
};

async function mockApi(page: Page, state: { teamsFail: boolean }) {
  const scopedListRequests: string[] = [];
  await routeTheApi(page, async ({ route, request, url, path }) => {
    if (path === '/api/auth/get-session') {
      await fulfillJson(route, OWNER_SESSION);
      return;
    }
    if (path === '/api/teams' && request.method() === 'GET') {
      if (state.teamsFail) {
        await fulfillJson(route, { error: 'Internal error' }, 500);
        return;
      }
      await fulfillJson(route, ACME_ORG_OWNED);
      return;
    }
    if (path === '/api/templates' && request.method() === 'GET') {
      scopedListRequests.push(url.search);
      await fulfillJson(route, []);
      return;
    }
    if (path === '/api/billing/status') {
      await fulfillJson(route, FREE_BILLING_STATUS);
      return;
    }
    if (path === '/api/checklists/run-org') {
      await fulfillJson(route, organizationRun);
      return;
    }
    if (path === '/api/checklists/run-org/history') {
      await fulfillJson(route, { checklistId: 'run-org', events: [], subject: { type: 'team', id: 'team-1' } });
      return;
    }
    await fulfillJson(route, []);
  });
  return scopedListRequests;
}

async function retryWithTheTeamsListBack(page: Page, state: { teamsFail: boolean }) {
  state.teamsFail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();

  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
}

test("a failed teams request shows an error instead of switching to Personal or loading Personal's Templates", async ({ page }) => {
  const state = { teamsFail: true };
  const templateListRequests = await mockApi(page, state);
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1'));

  await page.goto('/dashboard/templates/');

  await expect(page.getByText("Couldn't load your Organizations")).toBeVisible({ timeout: 30_000 });
  const switcher = page.getByRole('button', { name: 'Switch context' }).first();
  await expect(switcher).toContainText('Organizations unavailable');
  await expect(switcher).not.toContainText('Personal');
  const personalTemplateListRequests = templateListRequests.filter((search) => search.includes('scope=personal'));
  expect(personalTemplateListRequests).toEqual([]);

  state.teamsFail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();

  await expect(switcher).toContainText('Acme Org');
  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('team-1');
});

test('Continue in Personal leaves the error for Personal', async ({ page }) => {
  await mockApi(page, { teamsFail: true });
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1'));

  await page.goto('/dashboard/templates/');
  await page.getByRole('button', { name: 'Continue in Personal' }).click({ timeout: 30_000 });

  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Personal');
  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
});

test('in Personal, a failed teams request is shown on an Organization run and in the switcher', async ({ page }) => {
  const state = { teamsFail: true };
  await mockApi(page, state);
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'personal'));

  await page.goto('/dashboard/runs/run-org/');

  await expect(page.getByText("Couldn't load your Organizations")).toBeVisible({ timeout: 30_000 });
  const header = page.locator('[data-dashboard-page-header="true"]');
  await expect(header.getByText('View only')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue in Personal' })).toHaveCount(0);
  const switcher = page.getByRole('button', { name: 'Switch context' }).first();
  await expect(switcher).toContainText('Personal');
  await switcher.click();
  await expect(page.getByRole('menuitem', { name: 'Retry loading Organizations' })).toBeVisible();
  await page.keyboard.press('Escape');

  await retryWithTheTeamsListBack(page, state);
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toBeEnabled();
  await switcher.click();
  await expect(page.getByRole('menuitem', { name: /Acme Org/ })).toBeVisible();
});

const PUBLIC_TEMPLATE_PATH = '/profile/serp/ultimate-camping-checklist/';

async function openPublicTemplateWithFailedTeams(page: Page, state: { teamsFail: boolean }) {
  await mockApi(page, state);
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1'));
  await page.goto(PUBLIC_TEMPLATE_PATH);
  await expect(page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Couldn't load your Organizations")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeDisabled();
}

test('the public template page offers Retry when the teams request fails', async ({ page }) => {
  const state = { teamsFail: true };
  await openPublicTemplateWithFailedTeams(page, state);

  await retryWithTheTeamsListBack(page, state);
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeEnabled();
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('team-1');
});

test('the public template page can continue in Personal when the teams request fails', async ({ page }) => {
  await openPublicTemplateWithFailedTeams(page, { teamsFail: true });

  await page.getByRole('button', { name: 'Continue in Personal' }).click();

  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeEnabled();
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('personal');
});
