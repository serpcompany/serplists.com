import { expect, test } from '@playwright/test';

test('a mixed-case profile URL shows the profile at its lowercase URL, since usernames are stored lowercase', async ({ page }) => {
  await page.goto('/profile/JOHN/');

  await expect(page).toHaveURL(/\/profile\/john\/$/, { timeout: 30_000 });
  await expect(page.getByText('@john').first()).toBeVisible();
  await expect(page.getByText('Profile not found')).toHaveCount(0);
});
