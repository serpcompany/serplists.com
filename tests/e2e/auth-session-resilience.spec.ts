import { expect, test, type Page } from '@playwright/test';
import { loginAsAdmin } from './support/sign-in';
import { ACME_ORG_OWNED, FREE_BILLING_STATUS, fulfillJson, OWNER_SESSION, routeTheApi } from './support/mocked-api';

const CONSOLE_HOME_PATH = '/dashboard/templates/';

async function mockApi(page: Page, sessionAvailable: { value: boolean }) {
  await routeTheApi(page, async ({ route, request, path }) => {
    if (path === '/api/auth/get-session') {
      if (sessionAvailable.value) {
        await fulfillJson(route, OWNER_SESSION);
      } else {
        await fulfillJson(route, { error: 'Service unavailable' }, 503);
      }
      return;
    }
    if (path === '/api/teams' && request.method() === 'GET') {
      await fulfillJson(route, ACME_ORG_OWNED);
      return;
    }
    if (path === '/api/billing/status') {
      await fulfillJson(route, FREE_BILLING_STATUS);
      return;
    }
    await fulfillJson(route, []);
  });
}

test('a failing session check keeps the page and the Organization, then recovers on retry', async ({ page }) => {
  const sessionAvailable = { value: true };
  await mockApi(page, sessionAvailable);

  await page.goto('/dashboard/runs/');
  await page.evaluate(() => window.localStorage.setItem('serplists.activeWorkspaceId', 'team-1'));

  sessionAvailable.value = false;
  await page.reload();

  await expect(page.getByText(/Can't reach/)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  expect(await page.evaluate(() => window.localStorage.getItem('serplists.activeWorkspaceId'))).toBe('team-1');

  sessionAvailable.value = true;
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByRole('button', { name: 'Switch context' }).first()).toContainText('Acme Org', {
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
});

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
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/login/') {
      loginNavigations.push(frame.url());
    }
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  expect(rejected).toBe(1);
  expect(new URL(page.url()).pathname).toBe(CONSOLE_HOME_PATH);
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
  const retry = page.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe(CONSOLE_HOME_PATH);

  failing = false;
  await retry.click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
});
