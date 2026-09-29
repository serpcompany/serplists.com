import { expect, test, type Page } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

// Sign out leaves the app only once the server has ended the session. A failed sign-out
// (429 from the auth rate limit, a 5xx, or a dropped connection) keeps the user signed in and
// says so, because the session cookie is still valid (src/contexts/authSession.ts).

// The home page, where a finished sign-out lands. Every page URL ends in a slash, so only
// a path of exactly / means home.
const HOME_URL = /^https?:\/\/[^/]+\/(?:[?#].*)?$/;

async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
}

test('a failed sign-out keeps the user signed in, and a later one signs them out for good', async ({ page }) => {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  await page.route('**/api/auth/sign-out', (route) =>
    route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many requests"}' }),
  );
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();

  await expect(page.getByText(/Sign out failed/)).toBeVisible();
  await expect(page).not.toHaveURL(HOME_URL);
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible();
  // The UI told the truth: the session is still there after a reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  await page.unroute('**/api/auth/sign-out');
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });
});
