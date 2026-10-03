import { expect, test, type Page } from '@playwright/test';

import { answerTheAcmeOwnerSession, fulfillJson, routeTheApi } from './support/mocked-api';
import { organizationRun, organizationTemplate } from './support/organization-records';
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

const ACME_RECORDS = new Map<string, unknown>([
  [`/api/templates/${organizationTemplate.id}`, organizationTemplate],
  [`/api/templates/${organizationTemplate.id}/history`, { events: [], subject: { type: 'team', id: 'team-1' }, templateId: organizationTemplate.id, versions: [] }],
  [`/api/checklists/${organizationRun.id}`, organizationRun],
  [`/api/checklists/${organizationRun.id}/history`, { checklistId: organizationRun.id, events: [], subject: { type: 'team', id: 'team-1' } }],
]);

async function mockAcmeWithATemplate(page: Page) {
  const startedRuns: string[] = [];
  await routeTheApi(page, async (call) => {
    if (await answerTheAcmeOwnerSession(call)) return;
    const { route, url, path, method } = call;
    const inAcme = url.searchParams.get('teamId') === 'team-1';
    if (path === '/api/checklists' && method === 'POST') {
      startedRuns.push(organizationRun.id);
      await fulfillJson(route, { id: organizationRun.id });
    } else if (path === '/api/templates') {
      await fulfillJson(route, inAcme ? [organizationTemplate] : []);
    } else if (path === '/api/checklists') {
      await fulfillJson(route, inAcme ? startedRuns.map(() => organizationRun) : []);
    } else {
      await fulfillJson(route, ACME_RECORDS.get(path) ?? []);
    }
  });
  await page.addInitScript(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'personal'));
}

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

test("a Template opened from an Organization's Templates, its run, and the way back all stay at that Organization's URLs", async ({ page }) => {
  await mockAcmeWithATemplate(page);
  const visited: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });

  await page.goto(ACME_TEMPLATES);
  await page.getByRole('link', { name: organizationTemplate.title }).click({ timeout: 30_000 });
  await expect(page).toHaveURL(new RegExp(`${ACME_TEMPLATES}${organizationTemplate.id}/$`));
  await expect(page.getByRole('link', { name: 'My Templates' })).toHaveAttribute('href', ACME_TEMPLATES);
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', `${ACME_TEMPLATES}${organizationTemplate.id}/edit/`);

  await page.getByRole('button', { name: 'Start Run' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start Run' }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/organization/team-1/runs/${organizationRun.id}/$`));
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();

  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/organization\/team-1\/runs\/$/);
  await expect(page.getByRole('link', { name: organizationRun.title })).toHaveAttribute(
    'href',
    `/dashboard/organization/team-1/runs/${organizationRun.id}/`,
  );
  await expect(theSwitcher(page)).toContainText('Acme Org');
  expect(visited.filter((path) => !path.startsWith('/dashboard/organization/team-1/'))).toEqual([]);
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
