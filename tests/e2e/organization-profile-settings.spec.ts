import { expect, test, type Page } from '@playwright/test';

import { expectNoSidewaysScroll } from './support/phone';
import { registerNewAccount, uniqueSuffix } from './support/sign-in';

const PHOTO = 'public/og-default.png';

async function createAnOrganization(page: Page) {
  const suffix = uniqueSuffix();
  await registerNewAccount(page, {
    name: 'Profile Owner',
    email: `org-profile-${suffix}@example.test`,
    password: 'org-profile-password-1',
  });
  await page.goto('/dashboard/settings/');
  await page.locator('#team-name').fill(`Profile Org ${suffix}`);
  await page.getByRole('button', { name: 'Create Organization' }).click();
  await expect(page).toHaveURL(/\/dashboard\/organization\/[^/]+\/settings\/$/, { timeout: 15_000 });
}

const organizationAvatarImage = (page: Page) =>
  page.getByRole('button', { name: 'Upload avatar' }).locator('xpath=ancestor::div[.//*[@data-slot="avatar"]][1]').locator('[data-slot="avatar"] img');

test("an Organization's owner saves its description and avatar on its settings page, and both stay after a reload", async ({ page }) => {
  await createAnOrganization(page);

  await page.getByLabel('Description').fill('  Paid search agency for local businesses  ');
  await page.getByRole('button', { name: 'Save Organization' }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Organization updated' })).toBeVisible({ timeout: 15_000 });

  const fileChooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload avatar' }).click();
  await (await fileChooser).setFiles(PHOTO);
  await expect(page.getByText('Avatar updated successfully!')).toBeVisible({ timeout: 15_000 });
  await expect(organizationAvatarImage(page)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Description')).toHaveValue('Paid search agency for local businesses', { timeout: 15_000 });
  await expect(organizationAvatarImage(page)).toBeVisible();
});

test('the Organization avatar and description fit a phone', async ({ page }) => {
  await createAnOrganization(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByLabel('Description').scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Description')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload avatar' })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
