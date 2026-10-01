import { expect, test, type Page } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

const OFFSITE_RETURN_PATH = '/.//evil.com/share/x';
const CONSOLE_HOME_URL = /\/dashboard\/templates\/$/;
const TAG_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net)$/;

async function stubTagManagerContainer(page: Page) {
  await page.route(
    (url) => TAG_HOSTS.test(url.hostname),
    (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
}

async function recordOffsiteRequests(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route(
    (url) => url.hostname === 'evil.com' || url.hostname.endsWith('.evil.com'),
    async (route) => {
      requests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Left the app</h1>' });
    },
  );
  await stubTagManagerContainer(page);
  return requests;
}

async function signInAsJohn(page: Page) {
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('sign-in return path', () => {
  test('stays on the app when next normalizes to another origin', async ({ page, baseURL }) => {
    const offsite = await recordOffsiteRequests(page);
    const appOrigin = new URL(baseURL ?? page.url()).origin;

    await page.goto(`/login/?next=${encodeURIComponent(OFFSITE_RETURN_PATH)}`);
    await signInAsJohn(page);

    await expect(page).toHaveURL(CONSOLE_HOME_URL, { timeout: 30_000 });
    expect(new URL(page.url()).origin).toBe(appOrigin);
    expect(offsite).toEqual([]);
  });

  test('does not send a signed-in user to another origin from the login page', async ({ page, baseURL }) => {
    const offsite = await recordOffsiteRequests(page);
    const appOrigin = new URL(baseURL ?? page.url()).origin;

    await page.goto('/login/');
    await signInAsJohn(page);
    await expect(page).toHaveURL(CONSOLE_HOME_URL, { timeout: 30_000 });

    await page.goto(`/login/?next=${OFFSITE_RETURN_PATH}`);

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    expect(new URL(page.url()).origin).toBe(appOrigin);
    expect(offsite).toEqual([]);
  });
});
