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

async function openWhileTheTeamsRequestFails(page: Page, path: string, remembered: string) {
  const state = { teamsFail: true };
  const templateListRequests = await mockApi(page, state);
  await page.addInitScript((id) => window.localStorage.setItem('serplists.activeWorkspaceId', id), remembered);
  await page.goto(path);
  return { state, templateListRequests };
}

async function retryWithTheTeamsListBack(page: Page, state: { teamsFail: boolean }) {
  state.teamsFail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();

  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
}

test("the dashboard home waits on a failed teams request with an error instead of opening Personal's Templates, and Retry opens the remembered Organization", async ({ page }) => {
  const { state, templateListRequests } = await openWhileTheTeamsRequestFails(page, '/dashboard/', 'team-1');

  await expect(page.getByText("Couldn't load your Organizations")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard\/$/);
  const switcher = page.getByRole('button', { name: 'Switch context' }).first();
  await expect(switcher).toContainText('Organizations unavailable');
  await expect(switcher).not.toContainText('Personal');
  const contextListRequests = () => templateListRequests.filter((search) => /scope=personal|teamId=/.test(search));
  expect(contextListRequests()).toEqual([]);

  state.teamsFail = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard\/organization\/team-1\/templates\/$/);
  await expect(switcher).toContainText('Acme Org');
  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
  expect(contextListRequests().filter((search) => !search.includes('teamId=team-1'))).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('team-1');
});

test("Continue in Personal leaves the dashboard home's error for Personal's Templates", async ({ page }) => {
  await openWhileTheTeamsRequestFails(page, '/dashboard/', 'team-1');
  await page.getByRole('button', { name: 'Continue in Personal' }).click({ timeout: 30_000 });

  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Personal');
  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
});

test('a Personal URL shows Personal while the teams request fails, and the switcher offers a retry', async ({ page }) => {
  const { state, templateListRequests } = await openWhileTheTeamsRequestFails(page, '/dashboard/templates/', 'team-1');

  const switcher = page.getByRole('button', { name: 'Switch context' }).first();
  await expect(switcher).toContainText('Personal', { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'My Templates' })).toBeVisible();
  await expect.poll(() => templateListRequests.some((search) => search.includes('scope=personal'))).toBe(true);
  expect(templateListRequests.filter((search) => search.includes('teamId'))).toEqual([]);
  await switcher.click();
  await expect(page.getByRole('menuitem', { name: 'Retry loading Organizations' })).toBeVisible();
  await page.keyboard.press('Escape');

  await retryWithTheTeamsListBack(page, state);
  await switcher.click();
  await expect(page.getByRole('menuitem', { name: /Acme Org/ })).toBeVisible();
});

test("a Personal URL for an Organization run moves to the Organization's URL, which waits for a failed teams request with Retry", async ({ page }) => {
  const { state } = await openWhileTheTeamsRequestFails(page, '/dashboard/runs/run-org/', 'personal');

  await expect(page).toHaveURL(/\/dashboard\/organization\/team-1\/runs\/run-org\/$/, { timeout: 30_000 });
  await expect(page.getByText("Couldn't load your Organizations")).toBeVisible();
  const header = page.locator('[data-dashboard-page-header="true"]');
  await expect(header.getByText('View only')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rename' })).toHaveCount(0);

  await retryWithTheTeamsListBack(page, state);
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Acme Org');
});

const PUBLIC_TEMPLATE_PATH = '/profile/serp/ultimate-camping-checklist/';

async function openPublicTemplateWithFailedTeams(page: Page) {
  const { state } = await openWhileTheTeamsRequestFails(page, PUBLIC_TEMPLATE_PATH, 'team-1');
  await expect(page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("Couldn't load your Organizations")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeDisabled();
  return state;
}

test('the public template page offers Retry when the teams request fails', async ({ page }) => {
  const state = await openPublicTemplateWithFailedTeams(page);

  await retryWithTheTeamsListBack(page, state);
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeEnabled();
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('team-1');
});

test('the public template page can continue in Personal when the teams request fails', async ({ page }) => {
  await openPublicTemplateWithFailedTeams(page);

  await page.getByRole('button', { name: 'Continue in Personal' }).click();

  await expect(page.getByText("Couldn't load your Organizations")).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeEnabled();
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('personal');
});
