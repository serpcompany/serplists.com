import { expect, test, type Page } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

const HOME_PAGE_URL = /^https?:\/\/[^/]+\/(?:[?#].*)?$/;

async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
}

async function expectStillSignedInAfterReload(page: Page) {
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
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
  await expect(page).not.toHaveURL(HOME_PAGE_URL);
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible();
  await expectStillSignedInAfterReload(page);

  await page.unroute('**/api/auth/sign-out');
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });
});
