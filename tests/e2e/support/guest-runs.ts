import { expect, type Page } from '@playwright/test';

export const GUEST_TEMPLATE_PATH = '/profile/serp/ultimate-camping-checklist/';
export const GUEST_RUN_PATH = '/profile/serp/ultimate-camping-checklist/run/';
export const GUEST_TEMPLATE_TITLE = 'Ultimate Camping Checklist';

export async function startTheGuestRun(page: Page, name: string) {
  await page.goto(GUEST_TEMPLATE_PATH);
  await expect(page.getByRole('heading', { level: 1, name: GUEST_TEMPLATE_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await dialog.getByRole('textbox', { name: 'Run name', exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Start Run' }).click();
  await expect(page).toHaveURL(new RegExp(`${GUEST_RUN_PATH}$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

export const theRunPageHeader = (page: Page) => page.locator('[data-dashboard-page-header="true"]');
