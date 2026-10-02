import { expect, test, type Page } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

async function openConsoleSidebarSheet(page: Page) {
  await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
  return page.getByRole('dialog');
}

test('the account menu links to the profile right after signing in, without a reload', async ({ page }) => {
  await page.goto('/login/');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Account menu' }).click();
  const profile = page.getByRole('menuitem', { name: 'Profile' });
  await expect(profile).toBeVisible();
  await expect(profile).toHaveAttribute('href', '/profile/john/');
});

test('the mobile menu shows the @username right after signing in, without a reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login/');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  const sidebar = await openConsoleSidebarSheet(page);
  await expect(sidebar.getByText('@john')).toBeVisible();
});
