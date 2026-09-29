import { expect, test } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

// Errors the API router sends for /api/auth/* itself must reach the user, and a
// 429 must read as "wait", never as a failed sign-in (src/lib/auth/authErrors.ts).

test('a rate-limited sign-in tells the user to wait', async ({ page }) => {
  await page.route('**/api/auth/sign-in/email*', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': '120' },
      body: JSON.stringify({
        message: 'Too many requests. Please try again later.',
        error: 'Too many requests. Please try again later.',
        code: 'rate_limited',
        retryAfterSeconds: 120,
      }),
    });
  });

  await page.goto('/login');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Too many attempts. Please try again in 2 minutes.')).toBeVisible();
  await expect(page.getByText('Login failed')).toHaveCount(0);
});

test('a sign-in blocked by an older router body without a message still says to wait', async ({ page }) => {
  await page.route('**/api/auth/sign-in/email*', async (route) => {
    await route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Too many requests"}' });
  });

  await page.goto('/login');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Too many attempts. Please wait a few minutes and try again.')).toBeVisible();
});

test('a password reset refused by the router shows its message', async ({ page }) => {
  await page.route('**/api/auth/request-password-reset*', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Auth email is temporarily unavailable. Please contact support.',
        code: 'auth_email_unavailable',
      }),
    });
  });
  await page.route('**/api/auth/status*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accountRegistrationAvailable: true, emailAuthAvailable: true, emailVerificationRequired: false }),
    });
  });

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill('john@test.com');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByText('Auth email is temporarily unavailable. Please contact support.')).toBeVisible();
  await expect(page.getByText('Unable to send reset email')).toHaveCount(0);
});
