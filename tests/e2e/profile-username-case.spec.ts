import { expect, test } from '@playwright/test';

// Usernames are stored lowercase, so a typed or shared mixed-case profile URL
// must load the profile and settle on the canonical lowercase URL.
test('a mixed-case profile URL shows the profile at its lowercase URL', async ({ page }) => {
  await page.goto('/profile/JOHN/');

  await expect(page).toHaveURL(/\/profile\/john\/$/, { timeout: 30_000 });
  await expect(page.getByText('@john').first()).toBeVisible();
  await expect(page.getByText('User not found')).toHaveCount(0);
});
