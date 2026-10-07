import { expect, test } from '@playwright/test';

test('a public profile shows when the user joined', async ({ page }) => {
  await page.goto('/profile/john/');

  await expect(page.getByRole('heading', { level: 1, name: 'John (Free)' })).toBeVisible();
  await expect(page.getByText(/^Joined [A-Z][a-z]+ \d{4}$/)).toBeVisible();
  await expect(page.getByText('Invalid Date')).toHaveCount(0);
});
