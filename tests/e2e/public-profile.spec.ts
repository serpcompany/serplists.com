import { expect, test } from '@playwright/test';

// users.created_at is a D1 CURRENT_TIMESTAMP ('YYYY-MM-DD HH:MM:SS', UTC). The profile page
// must turn it into a month and year, never "Invalid Date" (src/lib/utils/dbTimestamp.ts).

test('a public profile shows when the user joined', async ({ page }) => {
  await page.goto('/profile/john/');

  await expect(page.getByRole('heading', { level: 1, name: 'John (Free)' })).toBeVisible();
  await expect(page.getByText(/^Joined [A-Z][a-z]+ \d{4}$/)).toBeVisible();
  await expect(page.getByText('Invalid Date')).toHaveCount(0);
});
