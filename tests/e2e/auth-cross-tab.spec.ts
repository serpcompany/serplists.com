import { expect, test, type Page } from '@playwright/test';

// Every tab shares one session cookie. When another tab signs in as someone else or signs out,
// an open tab must follow (src/contexts/sessionSync.ts) instead of showing the old user while
// its requests, and any Template it saves, go to the new one. Tab 1 is never reloaded here.

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function signIn(page: Page, fillButton: 'Fill Admin' | 'Fill John') {
  await page.goto('/login');
  await page.getByRole('button', { name: fillButton }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function openAccountMenu(page: Page) {
  await page.locator('header').first().getByRole('button', { name: /^[A-Z]$/ }).click();
}

async function signOut(page: Page) {
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });
}

async function openSignedInTab(page: Page) {
  await page.goto('/dashboard/templates');
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function expectAccountEmail(page: Page, email: string, notEmail: string) {
  await openAccountMenu(page);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect(page.getByText(notEmail, { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
}

test('an open tab follows another tab that signs in as someone else', async ({ context }) => {
  test.setTimeout(120_000);
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  await signIn(tab1, 'Fill Admin');
  await openSignedInTab(tab1);

  // Tab 2 replaces the session cookie with John's without signing out first, then loads the app.
  await openSignedInTab(tab2);
  await tab2.evaluate(async (apiBaseUrl) => {
    const response = await fetch(`${apiBaseUrl}/auth/sign-in/email`, {
      body: JSON.stringify({ email: 'john@test.com', password: 'password123' }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (!response.ok) throw new Error(`Sign-in failed: ${response.status}`);
  }, DEV_API_BASE_URL);
  await tab2.reload();
  await expect(tab2.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  await tab1.bringToFront();
  await expect(tab1.getByText('Signed in as john@test.com in another tab.')).toBeVisible({ timeout: 15_000 });
  await expectAccountEmail(tab1, 'john@test.com', 'admin@test.com');

  await signOut(tab2);
});

test('a sign-out in one tab signs the other tab out, and a sign-in brings it back', async ({ context }) => {
  test.setTimeout(120_000);
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  await signIn(tab1, 'Fill Admin');
  await openSignedInTab(tab1);
  await openSignedInTab(tab2);

  await signOut(tab2);
  await tab1.bringToFront();
  await expect(tab1).toHaveURL(/\/login/, { timeout: 15_000 });
  await expect(tab1.getByText('You were signed out.')).toBeVisible();

  // Tab 1 waits on /login for its original page; John's sign-in in tab 2 takes it there as John.
  await signIn(tab2, 'Fill John');
  await tab1.bringToFront();
  await expect(tab1).toHaveURL(/\/dashboard\/templates/, { timeout: 15_000 });
  await expectAccountEmail(tab1, 'john@test.com', 'admin@test.com');

  await signOut(tab2);
});
