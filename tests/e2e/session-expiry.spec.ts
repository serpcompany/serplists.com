import { expect, test } from '@playwright/test';

import { navigateInApp } from './support/navigation';
import { fillSignInForm } from './support/sign-in';

// When the server ends the session (it expired, or the user signed out other sessions or
// changed their password on another device), the next API request gets a 401. The tab must
// re-check the session and sign out, not stay "signed in" with empty lists and 'Unauthorized'
// errors (src/contexts/sessionSync.ts). Navigation stays in the app: a reload would hide the bug.

test('a tab whose session ended signs out on its next request and returns after sign-in', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  await navigateInApp(page, '/dashboard/templates');
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible();

  // The session ends on the server; the tab still thinks it is signed in.
  await context.clearCookies();
  await navigateInApp(page, '/dashboard/runs');

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByText('Your session ended. Sign in again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Unauthorized')).toHaveCount(0);

  // Signing in again returns to the page the user was on.
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs/, { timeout: 30_000 });
});
