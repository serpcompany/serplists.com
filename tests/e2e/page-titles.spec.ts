import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

async function openPricingFromHeader(page: Page) {
  await page.getByRole('banner').getByRole('link', { name: 'Pricing', exact: true }).click();
}

test('titles discovery pages with the brand', async ({ page }) => {
  await page.goto('/templates/');

  await expect(page).toHaveTitle('Template Library | SERP Lists');
});

test('resets the title on a client-side navigation to a page without its own title', async ({ page }) => {
  await page.goto('/templates/');
  await expect(page).toHaveTitle('Template Library | SERP Lists');

  await openPricingFromHeader(page);

  await expect(page).toHaveURL(/\/pricing\/$/);
  await expect(page).toHaveTitle('SERP Lists');
});

test('drops a public template title when leaving the template page', async ({ page }) => {
  await page.goto('/templates/');
  await page.getByRole('heading', { name: 'Ultimate Camping Checklist' }).click();
  await expect(page).toHaveURL(/\/profile\/serp\/ultimate-camping-checklist\/$/);
  await expect(page).toHaveTitle(/\| SERP Lists$/);
  await expect(page).toHaveTitle(/Camping/);

  await openPricingFromHeader(page);

  await expect(page).toHaveURL(/\/pricing\/$/);
  await expect(page).toHaveTitle('SERP Lists');
});
