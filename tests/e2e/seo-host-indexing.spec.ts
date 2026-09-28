import { expect, test } from '@playwright/test';

// The local stack is a non-production host, like staging and the *.pages.dev
// aliases: public pages must name serplists.com as canonical and stay noindex.
test('public template pages on a non-production host point at serplists.com and stay noindex', async ({
  page,
}) => {
  await page.goto('/profile/serp/ultimate-camping-checklist?utm_source=e2e');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://serplists.com/profile/serp/ultimate-camping-checklist',
  );
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    'noindex, nofollow',
  );
});
