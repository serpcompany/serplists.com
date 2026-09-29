import { expect, test, type Page } from '@playwright/test';

// The site header's navigation (src/components/layout/SiteNavigationMenu.tsx): "Templates" and
// "Features" open menus of their pages, "Pricing" is a link. The menus open from a click or the
// keyboard, name each link by its page, and mark the page that is open. Phones get the same
// groups in the menu sheet (public-mobile-nav.spec.ts).

test.use({ viewport: { width: 1280, height: 800 } });

// The open menu's content. Base UI renders it in a popup after the page, outside the header.
const openMenu = (page: Page) => page.locator('[data-slot="navigation-menu-content"][data-open]');

test('the Templates menu opens the Template Library and Categories, and marks the page open', async ({ page }) => {
  await page.goto('/pricing/');
  const nav = page.getByRole('banner').getByRole('navigation', { name: 'Site' });
  const templates = nav.getByRole('button', { name: 'Templates', exact: true });
  await expect(templates).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute('aria-current', 'page');

  await templates.click();
  await expect(templates).toHaveAttribute('aria-expanded', 'true');
  await openMenu(page).getByRole('link', { name: 'Categories', exact: true }).click();
  await expect(page).toHaveURL(/\/categories\/$/);
  // A link closes the menu it was picked from.
  await expect(templates).toHaveAttribute('aria-expanded', 'false');

  await templates.click();
  await expect(openMenu(page).getByRole('link', { name: 'Categories', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await openMenu(page).getByRole('link', { name: 'Template Library', exact: true }).click();
  await expect(page).toHaveURL(/\/templates\/$/);
});

test('the Features menu works from the keyboard', async ({ page }) => {
  await page.goto('/');
  const features = page.getByRole('banner').getByRole('button', { name: 'Features', exact: true });

  await features.focus();
  await page.keyboard.press('Enter');
  await expect(features).toHaveAttribute('aria-expanded', 'true');
  const menu = openMenu(page);
  for (const name of ['Template Builder', 'Checklist Runs', 'Public Sharing', 'Import + Export']) {
    await expect(menu.getByRole('link', { name, exact: true })).toBeVisible();
  }

  // Tab enters the menu, the arrow keys move within it, and Escape closes it and returns focus.
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
