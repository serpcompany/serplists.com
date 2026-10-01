import { expect, test, type Page } from '@playwright/test';
import { fillSignInForm } from './support/sign-in';

const JOHNS_PUBLIC_TEMPLATE_ID = 'template-2';

async function loginAsAdmin(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

const serviceUnavailable = {
  body: JSON.stringify({ error: 'Service unavailable' }),
  contentType: 'application/json',
  status: 503,
};

test('template detail offers a retry when loading the template fails', async ({ page }) => {
  await loginAsAdmin(page);
  let failing = true;
  const slugFallbackLookups: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/templates/slug/')) {
      slugFallbackLookups.push(request.url());
    }
  });
  await page.route(
    (url) => url.pathname.endsWith(`/api/templates/${JOHNS_PUBLIC_TEMPLATE_ID}`),
    async (route) => {
      if (failing && route.request().method() === 'GET') {
        await route.fulfill(serviceUnavailable);
        return;
      }
      await route.fallback();
    },
  );

  await page.goto(`/dashboard/templates/${JOHNS_PUBLIC_TEMPLATE_ID}/`);
  await expect(page.getByRole('heading', { name: 'Unable to load template' })).toBeVisible();
  await expect(page.getByText('Template Not Found')).toHaveCount(0);
  expect(slugFallbackLookups).toHaveLength(0);

  failing = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(
    page.getByRole('heading', { name: 'Keyword Research and Mapping Checklist' }).first(),
  ).toBeVisible();
});

test('a public profile offers a retry when loading the profile fails', async ({ page }) => {
  let failing = true;
  await page.route(
    (url) => url.pathname.endsWith('/api/profiles/by-username'),
    async (route) => {
      if (failing) {
        await route.fulfill(serviceUnavailable);
        return;
      }
      await route.fallback();
    },
  );

  await page.goto('/profile/john/');
  await expect(page.getByRole('heading', { name: 'Unable to load profile' })).toBeVisible();
  await expect(page.getByText('User not found')).toHaveCount(0);

  failing = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'John (Free)' })).toBeVisible();
});
