import { expect, test, type Locator, type Page } from '@playwright/test';

import { apiRequest } from './support/api-requests';
import { answerRunStartsAtActiveRunLimit } from './support/billing';
import { loginAsAdmin } from './support/sign-in';
import { runIdInTheUrl } from './support/run-saves';

async function expectFullyOpaque(locator: Locator) {
  await expect.poll(() => locator.evaluate((node) => getComputedStyle(node).opacity)).toBe('1');
}

async function openStartRunDialog(page: Page) {
  await page.goto('/dashboard/templates/');
  await page.getByRole('button', { name: 'Show templates in list view' }).click();
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  return page.getByRole('dialog', { name: 'Start a Run' });
}

test('Start Run at the run limit opens checkout instead of only toasting', async ({ page }) => {
  await loginAsAdmin(page);
  await answerRunStartsAtActiveRunLimit(page);
  let checkoutRequests = 0;
  await page.route('**/api/billing/checkout', async (route) => {
    checkoutRequests += 1;
    await route.fulfill({
      body: JSON.stringify({ url: '/pricing/?checkout=stubbed' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  const dialog = await openStartRunDialog(page);
  await dialog.getByRole('button', { name: 'Start Run' }).click();

  await expect(page).toHaveURL(/checkout=stubbed/);
  expect(checkoutRequests).toBe(1);
});

test('Start Run with a blank name uses the timestamped default the field shows', async ({ page }) => {
  await loginAsAdmin(page);

  const dialog = await openStartRunDialog(page);
  const placeholder =
    (await dialog.getByRole('textbox', { name: 'Run name', exact: true }).getAttribute('placeholder')) ?? '';
  const templateTitle = placeholder.split(' - ')[0];
  expect(templateTitle.length).toBeGreaterThan(0);

  await dialog.getByRole('button', { name: 'Start Run' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`${templateTitle} - `);

  const runId = runIdInTheUrl(page);
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
});

test('grid cards name the actions menu and never focus the hidden Start Run shortcut', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/dashboard/templates/');
  await page.getByRole('button', { name: 'Show templates in grid view' }).click();

  const trigger = page.getByRole('button', { name: /^Actions for / }).first();
  await expect(trigger).toBeAttached();
  const card = trigger.locator('xpath=ancestor::article[1]');

  await card.getByRole('link').first().focus();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expectFullyOpaque(trigger);

  await page.keyboard.press('Tab');
  expect(await card.evaluate((node) => node.contains(document.activeElement))).toBe(false);
});
