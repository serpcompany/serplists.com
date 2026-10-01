import { expect, test } from '@playwright/test';

import { navigateInApp } from './support/navigation';
import { endSessionSilently, fillSignInForm, loginAsAdmin } from './support/sign-in';

test('a tab whose session ended signs out on its next request and returns after sign-in', async ({ page, context }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);
  await navigateInApp(page, '/dashboard/templates/');
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible();

  await endSessionSilently(context);
  await navigateInApp(page, '/dashboard/runs/');

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(page.getByText('Your session ended. Sign in again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Unauthorized')).toHaveCount(0);

  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs/, { timeout: 30_000 });
});
