import { expect, test, type Page } from '@playwright/test';

const APP_JAVASCRIPT = /\/_next\/static\/.+\.js(\?.*)?$/;
const DARK_BACKGROUND_LIGHTNESS_BELOW = 40;
const LIGHT_BACKGROUND_LIGHTNESS_ABOVE = 215;

async function openWithTheAppsJavaScriptHeld(page: Page, storedTheme: string | null) {
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

const paintedBackgroundLightness = (page: Page) =>
  page.evaluate(() => {
    const canvasThatReadsAnyCssColor = document.createElement('canvas').getContext('2d');
    if (!canvasThatReadsAnyCssColor) return null;
    canvasThatReadsAnyCssColor.fillStyle = getComputedStyle(document.body).backgroundColor;
    canvasThatReadsAnyCssColor.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = canvasThatReadsAnyCssColor.getImageData(0, 0, 1, 1).data;
    const noBackgroundYet = alpha === 0;
    return noBackgroundYet ? null : (red + green + blue) / 3;
  });

test('the page is dark before the app loads for a stored dark theme, and the toggle follows it once the app runs', async ({ page }) => {
  const release = await openWithTheAppsJavaScriptHeld(page, 'dark');

  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect.poll(() => paintedBackgroundLightness(page)).toBeLessThan(DARK_BACKGROUND_LIGHTNESS_BELOW);

  release();
  await expect(page.getByRole('button', { name: 'Switch to light mode' }).first()).toBeAttached();
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
});

for (const storedTheme of ['light', null]) {
  test(`the page stays light for ${storedTheme ?? 'no stored'} theme`, async ({ page }) => {
    const release = await openWithTheAppsJavaScriptHeld(page, storedTheme);

    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect.poll(() => paintedBackgroundLightness(page)).toBeGreaterThan(LIGHT_BACKGROUND_LIGHTNESS_ABOVE);

    release();
    await expect(page.getByRole('button', { name: 'Switch to dark mode' }).first()).toBeAttached();
    await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });
}
