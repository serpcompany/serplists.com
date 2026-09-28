import { expect, test, type Page } from '@playwright/test';

// My Templates is the main place runs start (the dashboard's "Start a new run" links here).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
const RUN_LIMIT_MESSAGE =
  'Active run limit reached. Upgrade to Pro to create more checklist runs.';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function openStartRunDialog(page: Page) {
  await page.goto('/dashboard/templates');
  await page.getByRole('button', { name: 'Show templates in list view' }).click();
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  return page.getByRole('dialog', { name: 'Start Run' });
}

test('Start Run at the run limit opens checkout instead of only toasting', async ({ page }) => {
  await loginAsAdmin(page);

  // Answer the run start the way a Free context at its active-run limit is answered.
  await page.route('**/api/checklists', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({ code: 'limit_reached', error: RUN_LIMIT_MESSAGE }),
      contentType: 'application/json',
      status: 403,
    });
  });
  let checkoutRequests = 0;
  await page.route('**/api/billing/checkout', async (route) => {
    checkoutRequests += 1;
    await route.fulfill({
      body: JSON.stringify({ url: '/pricing?checkout=stubbed' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  const dialog = await openStartRunDialog(page);
  await dialog.getByRole('button', { name: 'Start Run' }).click();

  await expect(page).toHaveURL(/checkout=stubbed/);
  expect(checkoutRequests).toBe(1);
});

test('Start Run with a blank name uses the timestamped default the field shows', async ({ page }) => {
  await loginAsAdmin(page);

  const dialog = await openStartRunDialog(page);
  const placeholder = (await dialog.locator('#run-name').getAttribute('placeholder')) ?? '';
  const templateTitle = placeholder.split(' - ')[0];
  expect(templateTitle.length).toBeGreaterThan(0);

  await dialog.getByRole('button', { name: 'Start Run' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);

  // Before the fix a blank name saved the bare template title.
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`${templateTitle} - `);

  const runId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? '');
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
});
