import { expect, test } from '@playwright/test';

// The local stack is a non-production host, like staging and each Worker's workers.dev URL:
// public pages must name serplists.com as canonical and stay noindex. The page's own robots
// tag is the production one; every host but serplists.com gets X-Robots-Tag (next.config.ts),
// which search engines follow over it.
test('public template pages on a non-production host point at serplists.com and stay noindex', async ({
  page,
}) => {
  const response = await page.goto('/profile/serp/ultimate-camping-checklist?utm_source=e2e');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://serplists.com/profile/serp/ultimate-camping-checklist',
  );
  expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
});
