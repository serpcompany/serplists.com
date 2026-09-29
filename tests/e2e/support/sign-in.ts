import type { Page } from '@playwright/test';

// The seeded test users (db/seeds/local.ts), who all sign in with the dev password.
const TEST_USER_EMAILS = {
  admin: 'admin@test.com',
  jane: 'jane@test.com',
  john: 'john@test.com',
  serp: 'checklists@serp.co',
} as const;
const TEST_USER_PASSWORD = 'password123';

export type TestUser = keyof typeof TEST_USER_EMAILS;

/**
 * Fills the login form with a seeded test user, as the login page's Fill buttons do in
 * development. The browser tests run the production build, which has no dev helpers.
 */
export async function fillSignInForm(page: Page, user: TestUser) {
  await page.getByLabel('Email', { exact: true }).fill(TEST_USER_EMAILS[user]);
  await page.getByLabel('Password', { exact: true }).fill(TEST_USER_PASSWORD);
}
