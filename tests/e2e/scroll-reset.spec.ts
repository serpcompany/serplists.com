import { expect, test, type Page } from '@playwright/test';

// A link click opens the next page at the top, Back restores the previous offset, and
// typing in the library search (a search-only URL change) does not jump the page.

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test.describe('scroll reset on navigation', () => {
  test.use({ viewport: { width: 390, height: 700 } });

  test('a category link at the bottom of the library opens the category at the top', async ({
    page,
  }) => {
    await page.goto('/templates/');
    const browseHeading = page.getByRole('heading', { name: 'Browse by Category' });
    await browseHeading.scrollIntoViewIfNeeded();
    const categoryLink = browseHeading.locator('xpath=..').getByRole('link').first();
    await categoryLink.scrollIntoViewIfNeeded();
    const libraryOffset = await scrollY(page);
    expect(libraryOffset).toBeGreaterThan(0);

    await categoryLink.click();
    await expect(page).toHaveURL(/\/categories\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    expect(await scrollY(page)).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL(/\/templates\/$/);
    await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
  });

  test('a footer link from a long page opens the page at the top', async ({ page }) => {
    await page.goto('/templates/');
    const aboutLink = page.getByRole('contentinfo').getByRole('link', { name: 'About' });
    await aboutLink.scrollIntoViewIfNeeded();
    expect(await scrollY(page)).toBeGreaterThan(0);

    await aboutLink.click();
    await expect(page).toHaveURL(/\/about\/$/);
    expect(await scrollY(page)).toBe(0);
  });

  test('typing in the library search keeps the scroll position', async ({ page }) => {
    await page.goto('/templates/');
    const search = page.getByPlaceholder('Search templates...');
    await page.evaluate(() => window.scrollTo(0, 80));
    await search.focus();
    await expect.poll(() => scrollY(page)).toBeGreaterThan(0);
    const before = await scrollY(page);

    await page.keyboard.type('c');
    await expect(page).toHaveURL(/search=c/);
    expect(await scrollY(page)).toBe(before);
  });
});
