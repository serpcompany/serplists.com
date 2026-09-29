import { expect, test } from '@playwright/test';

// Page titles carry the product brand, and a page without its own title falls back to the
// brand instead of keeping the previous page's title after client-side navigation.

test.use({ viewport: { width: 1280, height: 800 } });

test('titles discovery pages with the brand', async ({ page }) => {
  await page.goto('/templates/');

  await expect(page).toHaveTitle('Discover Templates | SERP Lists');
});

test('resets the title when navigating to a page without its own title', async ({ page }) => {
  await page.goto('/templates/');
  await expect(page).toHaveTitle('Discover Templates | SERP Lists');

  // A header link navigates client-side; page.goto would load the page from the server and
  // hide the bug.
  await page.getByRole('banner').getByRole('link', { name: 'Pricing', exact: true }).click();

  await expect(page).toHaveURL(/\/pricing\/$/);
  await expect(page).toHaveTitle('SERP Lists');
});

test('drops a public template title when leaving the template page', async ({ page }) => {
  await page.goto('/templates/');
  await page.getByRole('heading', { name: 'Ultimate Camping Checklist' }).click();
  await expect(page).toHaveURL(/\/profile\/serp\/ultimate-camping-checklist\/$/);
  await expect(page).toHaveTitle(/\| SERP Lists$/);
  await expect(page).toHaveTitle(/Camping/);

  await page.getByRole('banner').getByRole('link', { name: 'Pricing', exact: true }).click();

  await expect(page).toHaveURL(/\/pricing\/$/);
  await expect(page).toHaveTitle('SERP Lists');
});
