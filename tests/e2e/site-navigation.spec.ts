import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

const openMenuPopupAfterThePage = (page: Page) => page.locator('[data-slot="navigation-menu-content"][data-open]');

const countUnnamedNavigationLandmarks = (page: Page) =>
  page
    .getByRole('navigation')
    .evaluateAll((navs) => navs.filter((nav) => !nav.getAttribute('aria-label') && !nav.getAttribute('aria-labelledby')).length);

test('the Templates menu opens the Template Library and Categories, marks the page open, and adds no unnamed navigation', async ({ page }) => {
  await page.goto('/pricing/');
  const nav = page.getByRole('banner').getByRole('navigation', { name: 'Site' });
  const templates = nav.getByRole('button', { name: 'Templates', exact: true });
  await expect(templates).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute('aria-current', 'page');

  await templates.click();
  await expect(templates).toHaveAttribute('aria-expanded', 'true');
  await expect(openMenuPopupAfterThePage(page).getByRole('link', { name: 'Categories', exact: true })).toBeVisible();
  expect(await countUnnamedNavigationLandmarks(page)).toBe(0);
  await openMenuPopupAfterThePage(page).getByRole('link', { name: 'Categories', exact: true }).click();
  await expect(page).toHaveURL(/\/categories\/$/);
  await expect(templates).toHaveAttribute('aria-expanded', 'false');

  await templates.click();
  await expect(openMenuPopupAfterThePage(page).getByRole('link', { name: 'Categories', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await openMenuPopupAfterThePage(page).getByRole('link', { name: 'Template Library', exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/$/);
});

test('the Features menu works from the keyboard: Tab enters it, the arrow keys move in it, and Escape closes it and returns focus', async ({ page }) => {
  await page.goto('/');
  const features = page.getByRole('banner').getByRole('button', { name: 'Features', exact: true });

  await features.focus();
  await page.keyboard.press('Enter');
  await expect(features).toHaveAttribute('aria-expanded', 'true');
  const menu = openMenuPopupAfterThePage(page);
  for (const name of ['Template Builder', 'Checklist Runs', 'Public Sharing', 'Import + Export']) {
    await expect(menu.getByRole('link', { name, exact: true })).toBeVisible();
  }

  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Template Builder', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('link', { name: 'Checklist Runs', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(features).toHaveAttribute('aria-expanded', 'false');
  await expect(features).toBeFocused();

  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('link', { name: 'Checklist Runs', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/features\/checklist-runs\/$/);
  await expect(page.getByRole('heading', { name: 'Checklist Runs' })).toBeVisible();
});
