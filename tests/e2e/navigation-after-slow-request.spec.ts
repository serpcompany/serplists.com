import { expect, test, type Page } from '@playwright/test';

import { apiJson, apiRequest } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// Pages that await a request and then navigate (Start Run to the new run, Save to the
// template list) must not pull a user who already left back to that destination: React
// Router still runs a navigate() from a page that is gone.

async function loginAsAdmin(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function deleteRun(page: Page, runId: string) {
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
}

async function deleteTemplate(page: Page, templateId: string) {
  await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' });
}

async function createTemplateViaApi(page: Page, title: string): Promise<string> {
  const template = await apiJson<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: {
      is_public: false,
      sections: [{ id: 'slow-section', title: 'Prep', items: [{ id: 'slow-task', title: 'First task' }] }],
      title,
    },
  });
  return template.id;
}

// Holds the next run creation until release() and records the created run's id.
async function holdRunCreation(page: Page) {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const created: { runId: string | null } = { runId: null };

  await page.route('**/api/checklists', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    await held;
    const response = await route.fetch();
    const body = (await response.json()) as { id?: string };
    created.runId = body.id ?? null;
    await route.fulfill({ response });
  });

  return { created, release };
}

test('stays on the page the user went Back to when a public Start Run finishes', async ({ page }) => {
  await loginAsAdmin(page);
  const { created, release } = await holdRunCreation(page);

  await page.goto('/templates/');
  await page.goto('/profile/admin/sample-technical-seo-audit-checklist/');
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await dialog.getByRole('button', { name: 'Start Run' }).click();
  await expect(dialog.getByRole('button', { name: 'Starting…' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/templates\/$/);

  release();
  await expect.poll(() => created.runId).toBeTruthy();
  // Give a late navigation the chance to happen before checking it did not.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/templates\/$/);

  await deleteRun(page, created.runId ?? '');
});

test('stays on the page the user went Back to when a template Start Run finishes', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createTemplateViaApi(page, `QA slow run ${Date.now()}`);
  const { created, release } = await holdRunCreation(page);

  await page.goto('/dashboard/templates/');
  await page.goto(`/dashboard/templates/${templateId}/`);
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await dialog.getByRole('button', { name: 'Start Run' }).click();
  await expect(dialog.getByRole('button', { name: 'Starting…' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);

  release();
  await expect.poll(() => created.runId).toBeTruthy();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);

  await deleteRun(page, created.runId ?? '');
  await deleteTemplate(page, templateId);
});

test('opens the new run when the user waits on the template page', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createTemplateViaApi(page, `QA run stays ${Date.now()}`);

  await page.goto(`/dashboard/templates/${templateId}/`);
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  await page.getByRole('dialog', { name: 'Start a Run' }).getByRole('button', { name: 'Start Run' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/);

  await deleteRun(page, decodeURIComponent(new URL(page.url()).pathname.split('/').filter(Boolean).pop() ?? ''));
  await deleteTemplate(page, templateId);
});

// A Start Run from My Templates that fails after the user has left must not send them
// to Stripe Checkout (or sign-in) from the page they moved to.
test('does not start checkout from the page the user went Back to when a My Templates run hits the limit', async ({ page }) => {
  await loginAsAdmin(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let answered = false;
  await page.route('**/api/checklists', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    await held;
    await route.fulfill({
      body: JSON.stringify({
        code: 'limit_reached',
        error: 'Active run limit reached. Upgrade to Pro to create more checklist runs.',
      }),
      contentType: 'application/json',
      status: 403,
    });
    answered = true;
  });
  let checkoutRequests = 0;
  await page.route('**/api/billing/checkout', async (route) => {
    checkoutRequests += 1;
    await route.fulfill({
      body: JSON.stringify({ url: '/pricing/?checkout=stubbed' }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.goto('/dashboard/runs/');
  await page.goto('/dashboard/templates/');
  await page.getByRole('button', { name: 'Show templates in list view' }).click();
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await dialog.getByRole('button', { name: 'Start Run' }).click();
  await expect(dialog.getByRole('button', { name: 'Starting…' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);

  release();
  await expect.poll(() => answered).toBe(true);
  // Give a late checkout the chance to start before checking it did not.
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  expect(checkoutRequests).toBe(0);
});
