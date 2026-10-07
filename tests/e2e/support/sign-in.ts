import { expect, type BrowserContext, type Page } from '@playwright/test';

import { API_BASE_URL, trackApiRequests } from './api-requests';

const SEEDED_USER_EMAILS = {
  admin: 'admin@test.com',
  jane: 'jane@test.com',
  john: 'john@test.com',
  serp: 'checklists@serp.co',
} as const;
const SEEDED_USER_PASSWORD = 'password123';
const SIGN_IN_LANDING_TIMEOUT_MS = 30_000;

export type TestUser = keyof typeof SEEDED_USER_EMAILS;

export async function fillSignInForm(page: Page, user: TestUser) {
  await page.getByLabel('Email', { exact: true }).fill(SEEDED_USER_EMAILS[user]);
  await page.getByLabel('Password', { exact: true }).fill(SEEDED_USER_PASSWORD);
}

export async function loginAs(page: Page, user: TestUser) {
  const myTemplatesRequests = trackApiRequests(page, API_BASE_URL);
  await page.goto('/login/');
  await fillSignInForm(page, user);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'My Templates' })).toBeVisible({
    timeout: SIGN_IN_LANDING_TIMEOUT_MS,
  });
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
  await myTemplatesRequests.settled();
}

export async function loginAsAdmin(page: Page) {
  await loginAs(page, 'admin');
}

export async function endSessionSilently(context: BrowserContext) {
  await context.clearCookies();
}

export function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerNewAccount(page: Page, account: { name: string; email: string; password: string }) {
  await page.goto('/register/');
  await page.getByLabel('Name').fill(account.name);
  await page.getByLabel('Email').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.locator('#confirmPassword').fill(account.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({
    timeout: 30_000,
  });
}

export async function submitTheSignInForm(page: Page, user: TestUser) {
  await fillSignInForm(page, user);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

export async function openAccountMenu(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
}

export async function signOutFromTheAccountMenu(page: Page) {
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible({ timeout: 15_000 });
}
