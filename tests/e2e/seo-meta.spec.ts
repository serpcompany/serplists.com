import { expect, test, type Page } from '@playwright/test';

// index.html's static description, Open Graph and Twitter tags are handed to
// react-helmet-async (data-rh), so a page's SEOHead replaces them instead of adding a
// second copy after them, and leaving that page restores the site defaults.

test.use({ viewport: { width: 1280, height: 800 } });

const SINGLE_TAGS = [
  'meta[name="description"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:type"]',
  'meta[property="og:image"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:image"]',
  'meta[name="viewport"]',
];

async function expectOneOfEachTag(page: Page) {
  for (const selector of SINGLE_TAGS) {
    await expect(page.locator(selector), selector).toHaveCount(1);
  }
}

test('a public template page has one description, its own', async ({ page }) => {
  await page.goto('/profile/serp/ultimate-camping-checklist');
  await expect(page).toHaveTitle(/Camping/);

  await expectOneOfEachTag(page);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute(
    'content',
    'Create and run checklists for your processes.',
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
});

test('leaving an SEO page restores the site defaults once', async ({ page }) => {
  await page.goto('/templates');
  await expect(page).toHaveTitle('Discover Templates | SERP Lists');
  await expectOneOfEachTag(page);

  // A header link navigates client-side; page.goto would reload index.html.
  await page.getByRole('banner').getByRole('link', { name: 'Pricing', exact: true }).click();
  await expect(page).toHaveURL(/\/pricing$/);
  await expect(page).toHaveTitle('SERP Lists');

  await expectOneOfEachTag(page);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Create and run checklists for your processes.',
  );
  await expect(page.locator('meta[name="twitter:title"]')).toHaveCount(0);
});
