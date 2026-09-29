import { expect, test } from '@playwright/test';

// Below the md breakpoint the public header hides its nav links and Log in; the menu
// button is how phone visitors reach them.
const MENU_LINKS = ['Templates', 'Features', 'Pricing', 'Log in', 'Get started'];

test.describe('public navigation on phones', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ['/', '/templates/', '/pricing/']) {
    test(`reaches Log in and every header link from ${path}`, async ({ page }) => {
      await page.goto(path);

      const menuButton = page.getByRole('button', { name: 'Open menu' });
      await expect(menuButton).toBeVisible();
      await menuButton.click();

      const menu = page.getByRole('dialog');
      for (const label of MENU_LINKS) {
        await expect(menu.getByRole('link', { name: label, exact: true })).toBeVisible();
      }

      await menu.getByRole('link', { name: 'Log in', exact: true }).click();
      await expect(page).toHaveURL(/\/login\/$/);
      await expect(page.getByRole('dialog')).toBeHidden();
    });
  }

  test('opens Pricing from the menu', async ({ page }) => {
    await page.goto('/templates/');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog').getByRole('link', { name: 'Pricing', exact: true }).click();

    await expect(page).toHaveURL(/\/pricing\/$/);
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('fits the header on a 320px screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: 'Open menu' });
    await expect(menuButton).toBeVisible();
    const box = await menuButton.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  });

  test('keeps the desktop header unchanged', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
    await expect(page.getByRole('banner').getByRole('link', { name: 'Log in', exact: true })).toBeVisible();
  });
});
