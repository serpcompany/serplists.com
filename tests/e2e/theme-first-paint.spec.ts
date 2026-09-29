import { expect, test, type Page } from '@playwright/test';

// A user who chose the dark theme must see a dark page from the first paint: a white screen
// until the app loaded, then a flip to dark, was a bug. The server sends each page's HTML,
// and the root layout's theme script marks <html> dark while the browser parses it. The
// app's JavaScript is held here, so the page is checked before any of it runs.

const APP_JAVASCRIPT = /\/_next\/static\/.+\.js(\?.*)?$/;

async function openWithAppHeld(page: Page, storedTheme: string | null) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(APP_JAVASCRIPT, async (route) => {
    await held;
    await route.continue();
  });
  await page.addInitScript((theme) => {
    if (theme === null) window.localStorage.removeItem('serplists-theme');
    else window.localStorage.setItem('serplists-theme', theme);
  }, storedTheme);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  return release;
}

// The page's painted background as the average of its RGB channels (0 black, 255 white), or
// null before the stylesheet gives it one. A canvas reads any CSS color syntax.
const backgroundLightness = (page: Page) =>
  page.evaluate(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return null;
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return alpha === 0 ? null : (red + green + blue) / 3;
  });

test('the page is dark before the app loads for a stored dark theme', async ({ page }) => {
  const release = await openWithAppHeld(page, 'dark');

  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect.poll(() => backgroundLightness(page)).toBeLessThan(40);

  release();
  // Once the app runs, the theme toggle follows the page.
  await expect(page.getByRole('button', { name: 'Switch to light mode' }).first()).toBeAttached();
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
});

for (const storedTheme of ['light', null]) {
  test(`the page stays light for ${storedTheme ?? 'no stored'} theme`, async ({ page }) => {
    const release = await openWithAppHeld(page, storedTheme);

    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect.poll(() => backgroundLightness(page)).toBeGreaterThan(215);

    release();
    await expect(page.getByRole('button', { name: 'Switch to dark mode' }).first()).toBeAttached();
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });
}
