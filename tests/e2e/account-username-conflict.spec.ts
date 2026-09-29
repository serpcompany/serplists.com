import { expect, test } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

// Choosing a username another account already has must say so, not fail with
// a bare 500 and "Failed to update profile" (functions/api/utils/username-conflict.ts).
test('saving another account username shows it is already taken', async ({ page }) => {
  await page.goto('/login/');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  await page.goto('/dashboard/settings/');
  const usernameInput = page.getByLabel('Username');
  await expect(usernameInput).toHaveValue('john', { timeout: 30_000 });

  const updateResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/update-user') && response.request().method() === 'POST',
  );
  await usernameInput.fill('Jane');
  await page.getByRole('button', { name: 'Update Profile' }).click();

  expect((await updateResponse).status()).toBe(422);
  await expect(page.getByText(/username is already taken/i)).toBeVisible();
  await expect(page.getByText('Failed to update profile')).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel('Username')).toHaveValue('john', { timeout: 30_000 });
});
