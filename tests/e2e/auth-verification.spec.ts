import { expect, test } from '@playwright/test';

test.describe('email verification return', () => {
  test('an expired link explains itself and offers a new email instead of claiming success', async ({
    page,
  }) => {
    await page.goto('/login/?verified=1&error=token_expired');

    await expect(page.getByRole('status').filter({ hasText: 'That verification link has expired.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible();
    await expect(page).toHaveURL(/\/login\/$/);
    await expect(page.getByText('Email verified. You can sign in now.')).toHaveCount(0);
  });

  test('a successful link still confirms verification once', async ({ page }) => {
    await page.goto('/login/?verified=1');

    await expect(page.getByText('Email verified. You can sign in now.')).toBeVisible();
    await expect(page).toHaveURL(/\/login\/$/);
    await expect(page.getByRole('button', { name: 'Resend verification email' })).toHaveCount(0);
  });
});
