import { expect, test, type Page } from '@playwright/test';

import { expectNoSidewaysScroll } from './support/phone';
import { loginAs } from './support/sign-in';

const TEMPLATE_PATH = '/profile/serp/ultimate-camping-checklist/';
const RUN_PATH = '/profile/serp/ultimate-camping-checklist/run/';
const TEMPLATE_TITLE = 'Ultimate Camping Checklist';

function recordApiWrites(page: Page): string[] {
  const writes: string[] = [];
  page.on('request', (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() !== 'GET' && pathname.startsWith('/api/')) writes.push(`${request.method()} ${pathname}`);
  });
  return writes;
}

async function startTheGuestRun(page: Page, name: string) {
  await page.goto(TEMPLATE_PATH);
  await expect(page.getByRole('heading', { level: 1, name: TEMPLATE_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await dialog.getByRole('textbox', { name: 'Run name', exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Start Run' }).click();
  await expect(page).toHaveURL(new RegExp(`${RUN_PATH}$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

const theHeader = (page: Page) => page.locator('[data-dashboard-page-header="true"]');

test('a visitor who is not signed in runs a public Template in the browser, and coming back keeps the progress and notes', async ({ page }) => {
  const apiWrites = recordApiWrites(page);
  await startTheGuestRun(page, 'Lake weekend');
  await expect(theHeader(page)).toContainText('This run is saved in this browser only.');
  await expect(page.getByRole('button', { name: /^(Share|Rename)$/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  const notes = page.getByRole('textbox', { name: 'Task notes' });
  await expect(page.getByRole('heading', { level: 2, name: 'Pack sleeping gear' })).toBeVisible();
  await notes.fill('Two sleeping bags');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByRole('button', { name: 'Save notes' })).toBeDisabled();

  await page.goto(TEMPLATE_PATH);
  await page.getByRole('link', { name: 'Continue Run' }).first().click();
  await expect(theHeader(page)).toContainText('1 of 4 tasks finished');
  await expect(page.getByRole('heading', { level: 2, name: 'Pack sleeping gear' })).toBeVisible();
  await expect(notes).toHaveValue('Two sleeping bags');
  expect(apiWrites).toEqual([]);
});

test('the Template page offers the run in progress instead of a second one, and a plain link opens it too', async ({ page }) => {
  await startTheGuestRun(page, 'Lake weekend');

  await page.goto(TEMPLATE_PATH);
  await expect(page.getByRole('link', { name: 'Continue Run' })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Start Run' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Continue Run' }).first().click();
  await expect(page).toHaveURL(new RegExp(`${RUN_PATH}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Lake weekend' })).toBeVisible();

  await page.goto(RUN_PATH);
  await expect(page.getByRole('heading', { level: 1, name: 'Lake weekend' })).toBeVisible();
});

test('a plain link to the run page starts a run named after the Template for a visitor who has none', async ({ page }) => {
  await page.goto(RUN_PATH);

  await expect(page.getByRole('heading', { level: 1, name: new RegExp(`^${TEMPLATE_TITLE} - `) })).toBeVisible();
  await expect(theHeader(page)).toContainText('0 of 4 tasks finished');
  await expect(page.getByRole('heading', { level: 2, name: 'Pack the tent setup' })).toBeVisible();
});

test('Delete run asks first, goes back to the Template page, and Start Run starts afresh', async ({ page }) => {
  await startTheGuestRun(page, 'Lake weekend');

  await page.getByRole('button', { name: 'Delete run' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Delete run' });
  await expect(dialog).toContainText('Are you sure you want to delete this run?');
  await dialog.getByRole('button', { name: 'Delete' }).click();

  await expect(page).toHaveURL(new RegExp(`${TEMPLATE_PATH}$`));
  await expect(page.getByText('Run deleted')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Continue Run' })).toHaveCount(0);
});

test('completing the run keeps the visitor on it, completed and frozen, and the Template page starts a new one', async ({ page }) => {
  await startTheGuestRun(page, 'Lake weekend');

  for (const nextTask of ['Pack sleeping gear', 'Bring stove, fuel, and water', 'Pack first-aid and light sources']) {
    await page.getByRole('button', { name: 'Mark Complete' }).click();
    await expect(page.getByRole('heading', { level: 2, name: nextTask })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Complete this Run?' });
  await dialog.getByRole('button', { name: 'Complete Run' }).click();

  await expect(page.getByText('Run completed').first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${RUN_PATH}$`));
  await expect(theHeader(page)).toContainText('Completed');
  await expect(page.getByRole('checkbox', { name: /^Mark ".+" complete$/ })).toBeDisabled();

  await page.goto(TEMPLATE_PATH);
  await expect(page.getByRole('button', { name: 'Start Run' }).first()).toBeEnabled();
});

test('a signed-in user who opens the run link with no run in this browser lands on the Template page', async ({ page }) => {
  await loginAs(page, 'admin');

  await page.goto(RUN_PATH);

  await expect(page).toHaveURL(new RegExp(`${TEMPLATE_PATH}$`));
  await expect(page.getByRole('heading', { level: 1, name: TEMPLATE_TITLE })).toBeVisible();
});

test('the guest run page works at phone width: no sideways scroll, and the Tasks sheet opens any task', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startTheGuestRun(page, 'Lake weekend');

  await expectNoSidewaysScroll(page);
  await expect(page.getByRole('button', { name: 'Delete run' })).toBeVisible();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Tasks' });
  await sheet.getByRole('button', { name: /Pack first-aid and light sources/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 2, name: 'Pack first-aid and light sources' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
