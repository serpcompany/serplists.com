import { expect, test } from '@playwright/test';
import { loginAsAdmin } from './support/sign-in';

test('import and export stay usable when the plan check fails', async ({ page }) => {
  await loginAsAdmin(page);

  await page.route('**/api/billing/status**', (route) =>
    route.fulfill({
      body: JSON.stringify({ error: 'Internal error' }),
      contentType: 'application/json',
      status: 500,
    }),
  );
  let checkoutRequests = 0;
  await page.route('**/api/billing/checkout', async (route) => {
    checkoutRequests += 1;
    await route.abort();
  });

  await page.goto('/dashboard/import-templates/');

  await expect(page.getByText("Couldn't check your plan")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByText('Template import/export is available on Pro.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Upgrade to Pro' })).toHaveCount(0);
  await expect(page.getByLabel('Select a YAML, JSON, or Markdown template file')).toBeEnabled();
  expect(checkoutRequests).toBe(0);
});

test('pricing offers a retry, not the upgrade, when the plan check fails', async ({ page }) => {
  await loginAsAdmin(page);

  let statusFails = true;
  await page.route('**/api/billing/status**', (route) =>
    statusFails
      ? route.fulfill({
          body: JSON.stringify({ error: 'Internal error' }),
          contentType: 'application/json',
          status: 500,
        })
      : route.fulfill({
          body: JSON.stringify({
            billingEnabled: true,
            canManageBilling: true,
            plan: 'pro',
            subscriptionStatus: 'active',
          }),
          contentType: 'application/json',
          status: 200,
        }),
  );
  let checkoutRequests = 0;
  await page.route('**/api/billing/checkout', async (route) => {
    checkoutRequests += 1;
    await route.abort();
  });

  await page.goto('/pricing/');

  await expect(page.getByText("Couldn't check your plan")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Upgrade/ })).toHaveCount(0);

  statusFails = false;
  await page.getByRole('button', { name: 'Retry' }).click();

  await expect(page.getByRole('link', { name: 'Manage Pro' })).toBeVisible();
  await expect(page.getByText("Couldn't check your plan")).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Upgrade/ })).toHaveCount(0);
  expect(checkoutRequests).toBe(0);
});
