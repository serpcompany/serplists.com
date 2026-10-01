import { expect, test, type Page } from '@playwright/test';

import { loginAsAdmin } from './support/sign-in';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function expectNoSidewaysScroll(page: Page) {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

async function openOutline(page: Page) {
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Outline' });
  await expect(sheet).toBeVisible();
  return sheet;
}

test('at 390px the outline opens in a sheet, closes on the entry picked, and stays open while a section moves', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/templates/new/');
  await expect(page.getByLabel('Template Name', { exact: true })).toBeVisible();
  const outlineBesideTheForm = page.getByRole('button', { name: 'Add section' });
  await expect(outlineBesideTheForm).toHaveCount(0);
  await expectNoSidewaysScroll(page);

  let sheet = await openOutline(page);
  await expect(sheet.getByRole('button', { name: 'Drag Section 1' })).toBeHidden();
  await expect(sheet.getByRole('button', { name: 'Move Section 1 up' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Add section' }).click();

  await expect(sheet).toBeHidden();
  const panelHeading = page.getByRole('heading', { name: 'Section Settings' });
  await expect(panelHeading).toBeFocused();

  sheet = await openOutline(page);
  await expect(sheet.getByRole('button', { name: 'Move Section 1 up' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Move Section 2 up' }).click();
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Moved Section 2 to position 1 of 2' })).toHaveCount(1);
  await expect(sheet.getByRole('button', { name: 'Move Section 1 down' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Outline', exact: true })).toBeFocused();
  await expectNoSidewaysScroll(page);
});

test('at 390px a touch screen reorders content blocks with their Move buttons', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/templates/new/');

  const sheet = await openOutline(page);
  await sheet.getByRole('button', { name: 'Add task to Section 1' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Task Details' })).toBeFocused();

  await page.getByRole('button', { name: 'Add Block' }).last().click();
  await page.getByRole('menuitem', { name: 'Text', exact: true }).click();
  await page.getByRole('button', { name: 'Add Block' }).first().click();
  await page.getByRole('menuitem', { name: 'Embed', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Drag Embed block' })).toBeHidden();
  await page.getByRole('button', { name: 'Move Embed block up' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Moved Embed block to position 1 of 2' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Move Embed block down' })).toBeFocused();
  const embedField = await page.getByLabel('Embed Code or URL').boundingBox();
  const textField = await page.getByLabel('Text Content').boundingBox();
  expect(embedField!.y).toBeLessThan(textField!.y);
  await expectNoSidewaysScroll(page);
});
