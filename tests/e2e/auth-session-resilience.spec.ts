import { expect, test, type Page } from '@playwright/test';

// A rate-limited or failed session check must not log a signed-in user out
// (src/lib/auth/sessionCheck.ts). Only a definite "no session" answer does.

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

test('a 429 on the page-load session check retries instead of redirecting to login', async ({ page }) => {
  await loginAsAdmin(page);

  let rejected = 0;
  await page.route('**/api/auth/get-session*', async (route) => {
    if (rejected === 0 && route.request().method() === 'GET') {
      rejected += 1;
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        headers: { 'Retry-After': '1' },
        body: JSON.stringify({ error: 'Too many requests' }),
      });
      return;
    }
    await route.continue();
  });

  const loginNavigations: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/login') {
      loginNavigations.push(frame.url());
    }
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  expect(rejected).toBe(1);
  expect(new URL(page.url()).pathname).toBe('/dashboard');
  expect(loginNavigations).toEqual([]);
});

test('a session check that keeps failing offers a retry instead of the login page', async ({ page }) => {
  await loginAsAdmin(page);

  let failing = true;
  await page.route('**/api/auth/get-session*', async (route) => {
    if (failing) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' });
      return;
    }
    await route.continue();
  });

  await page.goto('/dashboard');
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe('/dashboard');

  failing = false;
  await retry.click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
});
