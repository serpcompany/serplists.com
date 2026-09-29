import { expect, test } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

// Better Auth's sign-in response has no username, so the signed-in user must come from a
// session read (docs/design-docs/authentication.md). Nothing here reloads the page after
// signing in: a reload would read the session again and hide the bug.

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

  // Phones open the console sidebar as a sheet; its account row shows the handle.
  await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
  await expect(page.getByRole('dialog').getByText('@john')).toBeVisible();
});
