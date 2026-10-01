import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import {
  openAccountMenu,
  signOutFromTheAccountMenu as signOut,
  submitTheSignInForm,
  type TestUser,
} from './support/sign-in';

async function signIn(page: Page, user: TestUser) {
  await page.goto('/login/');
  await submitTheSignInForm(page, user);
}

async function openSignedInTab(page: Page) {
  await page.goto('/dashboard/templates/');
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function replaceSessionCookieWithoutSigningOut(page: Page, email: string) {
  await apiJson(page, '/auth/sign-in/email', {
    method: 'POST',
    body: { email, password: 'password123' },
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function expectAccountEmail(page: Page, email: string, notEmail: string) {
  await openAccountMenu(page);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByText(notEmail, { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
}

async function twoTabsSignedInAsAdmin(context: BrowserContext) {
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  await signIn(tab1, 'admin');
  await openSignedInTab(tab1);
  await openSignedInTab(tab2);
  return { tab1, tab2 };
}

test('an open tab follows another tab that signs in as someone else, without a reload', async ({ context }) => {
  test.setTimeout(120_000);
  const { tab1, tab2 } = await twoTabsSignedInAsAdmin(context);
  await replaceSessionCookieWithoutSigningOut(tab2, 'john@test.com');

  await tab1.bringToFront();
  await expect(tab1.getByText('Signed in as john@test.com in another tab.')).toBeVisible({ timeout: 15_000 });
  await expectAccountEmail(tab1, 'john@test.com', 'admin@test.com');

  await signOut(tab2);
});

test('a sign-out in one tab signs the other tab out, and a sign-in brings it back, without a reload', async ({ context }) => {
  test.setTimeout(120_000);
  const { tab1, tab2 } = await twoTabsSignedInAsAdmin(context);

  await signOut(tab2);
  await tab1.bringToFront();
  await expect(tab1).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(tab1.getByText('Your session ended. Sign in again.')).toBeVisible();

  await signIn(tab2, 'john');
  await tab1.bringToFront();
  await expect(tab1).toHaveURL(/\/dashboard\/templates/, { timeout: 15_000 });
  await expectAccountEmail(tab1, 'john@test.com', 'admin@test.com');

  await signOut(tab2);
});
