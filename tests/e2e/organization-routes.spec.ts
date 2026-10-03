import { expect, test, type Page } from '@playwright/test';

import { answerTheAcmeOwnerSession, fulfillJson, routeTheApi } from './support/mocked-api';
import { expectNoSidewaysScroll } from './support/phone';

const ACME_TEMPLATES = '/dashboard/organization/team-1/templates/';

async function mockApi(page: Page) {
  const scopedListSearches: string[] = [];
  await routeTheApi(page, async (call) => {
    if (await answerTheAcmeOwnerSession(call)) return;
    const { route, url, path } = call;
    if (path === '/api/templates' || path === '/api/checklists') scopedListSearches.push(url.search);
    await fulfillJson(route, []);
  });
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'personal'));
  return scopedListSearches;
}

const theSwitcher = (page: Page) => page.getByRole('button', { name: 'Switch context' }).first();

test("an Organization URL opens that Organization's Templates in a tab that remembered Personal, and a reload keeps it", async ({ page }) => {
  const scopedListSearches = await mockApi(page);

  await page.goto(ACME_TEMPLATES);

  await expect(theSwitcher(page)).toContainText('Acme Org', { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Runs' })).toHaveAttribute('href', '/dashboard/organization/team-1/runs/');
  await expect.poll(() => scopedListSearches.some((search) => search.includes('teamId=team-1'))).toBe(true);
  expect(scopedListSearches.filter((search) => search.includes('scope=personal'))).toEqual([]);

  await page.reload();

  await expect(theSwitcher(page)).toContainText('Acme Org', { timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${ACME_TEMPLATES}$`));
});

test('switching to Personal on an Organization page opens the same section in Personal', async ({ page }) => {
  await mockApi(page);
  await page.goto('/dashboard/organization/team-1/runs/');
  await expect(theSwitcher(page)).toContainText('Acme Org', { timeout: 30_000 });

  await theSwitcher(page).click();
  await page.getByRole('menuitem', { name: /Personal/ }).click();

  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  await expect(theSwitcher(page)).toContainText('Personal');
  await expect(page.getByRole('link', { name: 'Runs' })).toHaveAttribute('href', '/dashboard/runs/');
});

test('an Organization the user is not in shows the not-found page and loads none of its data', async ({ page }) => {
  const scopedListSearches = await mockApi(page);

  await page.goto('/dashboard/organization/team-9/templates/');

  await expect(page.getByRole('heading', { name: 'That page does not exist' })).toBeVisible({ timeout: 30_000 });
  await expect(theSwitcher(page)).toContainText('Personal');
  expect(scopedListSearches.filter((search) => search.includes('team-9'))).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('an Organization page fits the screen, and its context switcher opens Personal from the sidebar sheet', async ({ page }) => {
    await mockApi(page);
    await page.goto(ACME_TEMPLATES);
    await expect(page.getByRole('heading', { name: 'My Templates' })).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page);

    await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
    await theSwitcher(page).click();
    await page.getByRole('menuitem', { name: /Personal/ }).click();

    await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
    await expectNoSidewaysScroll(page);
  });

  test('the not-found page for an Organization the user is not in fits the screen', async ({ page }) => {
    await mockApi(page);
    await page.goto('/dashboard/organization/team-9/runs/');

    await expect(page.getByRole('heading', { name: 'That page does not exist' })).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page);
  });
});
