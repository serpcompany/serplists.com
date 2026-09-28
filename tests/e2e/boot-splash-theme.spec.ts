import { expect, test, type Page } from '@playwright/test';

// The boot splash covers the screen until the app bundle runs. It was always white, so a
// dark-theme user saw a white screen on every page load before the app turned dark. The
// app entry is held here so the splash stays up long enough to check.

const APP_ENTRY = /\/src\/main\.tsx(\?.*)?$|\/assets\/index-[\w-]+\.js$/;

async function openWithAppHeld(page: Page, storedTheme: string | null) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(APP_ENTRY, async (route) => {
    await held;
    await route.continue();
  });
  await page.addInitScript((theme) => {
    if (theme === null) window.localStorage.removeItem('serplists-theme');
    else window.localStorage.setItem('serplists-theme', theme);
  }, storedTheme);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#boot-splash')).toBeVisible();
  return release;
}

const splashBackground = (page: Page) =>
  page.locator('#boot-splash').evaluate((element) => getComputedStyle(element).backgroundColor);

test('the boot splash is dark for a stored dark theme', async ({ page }) => {
  const release = await openWithAppHeld(page, 'dark');

  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await splashBackground(page)).toBe('rgb(3, 3, 3)');

  release();
  await expect(page.locator('#boot-splash')).toHaveCount(0);
});

for (const storedTheme of ['light', null]) {
  test(`the boot splash stays white for ${storedTheme ?? 'no stored'} theme`, async ({ page }) => {
    const release = await openWithAppHeld(page, storedTheme);

    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    expect(await splashBackground(page)).toBe('rgb(255, 255, 255)');
    release();
  });
}
