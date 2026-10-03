import { expect, test, type Page } from '@playwright/test';

import { answerTheAcmeOwnerSession, fulfillJson, routeTheApi } from './support/mocked-api';
import { organizationRun, organizationTemplate } from './support/organization-records';
import { expectNoSidewaysScroll } from './support/phone';

const ACME_TEMPLATES = '/dashboard/organization/team-1/templates/';

const ACME_RECORDS = new Map<string, unknown>([
  [`/api/templates/${organizationTemplate.id}`, organizationTemplate],
  [`/api/templates/${organizationTemplate.id}/history`, { events: [], subject: { type: 'team', id: 'team-1' }, templateId: organizationTemplate.id, versions: [] }],
  [`/api/checklists/${organizationRun.id}`, organizationRun],
  [`/api/checklists/${organizationRun.id}/history`, { checklistId: organizationRun.id, events: [], subject: { type: 'team', id: 'team-1' } }],
]);

async function remember(page: Page, contextId: string) {
  await page.addInitScript((id) => {
    if (window.sessionStorage.getItem('remembered-context-seeded')) return;
    window.sessionStorage.setItem('remembered-context-seeded', 'yes');
    window.localStorage.setItem('serplists.activeWorkspaceId', id);
  }, contextId);
}

async function mockApi(page: Page, { remembered = 'personal' }: { remembered?: string } = {}) {
  const scopedListSearches: string[] = [];
  const requestedPaths: string[] = [];
  await routeTheApi(page, async (call) => {
    if (await answerTheAcmeOwnerSession(call)) return;
    const { route, url, path } = call;
    requestedPaths.push(`${path}${url.search}`);
    if (path === '/api/templates' || path === '/api/checklists') scopedListSearches.push(url.search);
    await fulfillJson(route, ACME_RECORDS.get(path) ?? []);
  });
  await remember(page, remembered);
  return { requestedPaths, scopedListSearches };
}

const theSwitcher = (page: Page) => page.getByRole('button', { name: 'Switch context' }).first();

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
  await remember(page, 'personal');
}

test("an Organization URL opens that Organization's Templates in a tab that remembered Personal, and a reload keeps it", async ({ page }) => {
  const { scopedListSearches } = await mockApi(page);

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
  const { scopedListSearches } = await mockApi(page);

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

test('a Personal URL shows Personal in a tab that remembered an Organization, and becomes the remembered context', async ({ page }) => {
  const { scopedListSearches } = await mockApi(page, { remembered: 'team-1' });

  await page.goto('/dashboard/templates/');

  await expect(theSwitcher(page)).toContainText('Personal', { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Runs' })).toHaveAttribute('href', '/dashboard/runs/');
  await expect.poll(() => scopedListSearches.some((search) => search.includes('scope=personal'))).toBe(true);
  expect(scopedListSearches.filter((search) => search.includes('teamId'))).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('personal');
});

test("the dashboard home opens the remembered Organization's Templates, and Back skips it", async ({ page }) => {
  await mockApi(page, { remembered: 'team-1' });
  await page.goto('/pricing/');

  await page.goto('/dashboard/');

  await expect(page).toHaveURL(new RegExp(`${ACME_TEMPLATES}$`), { timeout: 30_000 });
  await expect(theSwitcher(page)).toContainText('Acme Org');
  await page.goBack();
  await expect(page).toHaveURL(/\/pricing\/$/);
});

test('the dashboard home opens Personal for a remembered Organization the user is not in, and asks for none of its data', async ({ page }) => {
  const { requestedPaths } = await mockApi(page, { remembered: 'team-9' });

  await page.goto('/dashboard/');

  await expect(page).toHaveURL(/\/dashboard\/templates\/$/, { timeout: 30_000 });
  await expect(theSwitcher(page)).toContainText('Personal');
  expect(requestedPaths.filter((path) => path.includes('team-9'))).toEqual([]);
});

test("a Personal URL for a private Organization Template moves a member to the Organization's URL, and Back skips it", async ({ page }) => {
  await mockApi(page);
  await page.goto('/pricing/');

  await page.goto(`/dashboard/templates/${organizationTemplate.id}/`);

  await expect(page).toHaveURL(new RegExp(`${ACME_TEMPLATES}${organizationTemplate.id}/$`), { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: organizationTemplate.title })).toBeVisible();
  await expect(theSwitcher(page)).toContainText('Acme Org');
  await page.goBack();
  await expect(page).toHaveURL(/\/pricing\/$/);
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

  test("a Personal URL for an Organization Run moves to the Organization's URL and fits the screen", async ({ page }) => {
    await mockApi(page, { remembered: 'team-1' });

    await page.goto(`/dashboard/runs/${organizationRun.id}/`);

    await expect(page).toHaveURL(new RegExp(`/dashboard/organization/team-1/runs/${organizationRun.id}/$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1, name: organizationRun.title })).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('the dashboard home opens the remembered Organization and fits the screen', async ({ page }) => {
    await mockApi(page, { remembered: 'team-1' });

    await page.goto('/dashboard/');

    await expect(page).toHaveURL(new RegExp(`${ACME_TEMPLATES}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'My Templates' })).toBeVisible();
    await expectNoSidewaysScroll(page);
  });

  test('the not-found page for an Organization the user is not in fits the screen', async ({ page }) => {
    await mockApi(page);
    await page.goto('/dashboard/organization/team-9/runs/');

    await expect(page.getByRole('heading', { name: 'That page does not exist' })).toBeVisible({ timeout: 30_000 });
    await expectNoSidewaysScroll(page);
  });
});
