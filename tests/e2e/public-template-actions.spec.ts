import { expect, test, type Page } from '@playwright/test';

import { apiRequest } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// Start Run and Save on a public template page act once per click intent
// (src/views/PublicTemplate.tsx, src/components/template/PublicTemplateView.tsx).

const PUBLIC_TEMPLATE_PATH = '/profile/serp/ultimate-camping-checklist/';

async function loginAsAdmin(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function openPublicTemplate(page: Page) {
  await page.goto(PUBLIC_TEMPLATE_PATH);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ultimate Camping Checklist' }),
  ).toBeVisible();
}

// Start Run asks for the Run's name in the Start a Run dialog, as on My Templates and template
// detail. The rest of the double click that opened it leaves it open, and a double click on
// its Start Run creates one run.
test('a double click on the header Start Run opens the dialog, and one on its Start Run creates one run', async ({ page }) => {
  await loginAsAdmin(page);
  const runCreates: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/api/checklists')) {
      runCreates.push(request.url());
    }
  });

  await openPublicTemplate(page);
  // The header button comes first in the page; the bottom call-to-action is second.
  await page.getByRole('button', { name: 'Start Run' }).first().dblclick();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Run name', exact: true })).toHaveAttribute(
    'placeholder',
    /^Ultimate Camping Checklist - /,
  );
  expect(runCreates).toHaveLength(0);

  await dialog.getByRole('button', { name: 'Start Run' }).dblclick();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+\/$/);
  expect(runCreates).toHaveLength(1);

  const runId = new URL(page.url()).pathname.split('/').filter(Boolean).pop();
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
});

// A visitor who is not signed in signs in first, and is not asked for a name.
test('Start Run sends a visitor who is not signed in to sign in', async ({ page }) => {
  await openPublicTemplate(page);
  await page.getByRole('button', { name: 'Start Run' }).first().click();

  await expect(page).toHaveURL(/\/login\/\?next=%2Fprofile%2Fserp%2Fultimate-camping-checklist%2F$/);
  await expect(page.getByRole('dialog', { name: 'Start a Run' })).toHaveCount(0);
});

test('a failed Save keeps the Save button instead of showing Saved', async ({ page }) => {
  await loginAsAdmin(page);
  let templateCreates = 0;
  // The library template is copied with POST /api/templates; fail it like a server error.
  await page.route('**/api/templates', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    templateCreates += 1;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Simulated save failure' }),
    });
  });

  await openPublicTemplate(page);
  const headerSave = page.getByRole('button', { name: 'Save', exact: true });
  await headerSave.dblclick();

  await expect(page.getByText('Simulated save failure').first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${PUBLIC_TEMPLATE_PATH}$`));
  await expect(headerSave).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Saved' })).toHaveCount(0);
  expect(templateCreates).toBe(1);
});

test('a Free Personal user sees that Save leads to an upgrade', async ({ page }) => {
  // John has no Personal Pro plan; copying into Personal is a Pro feature.
  await page.goto('/login/');
  await fillSignInForm(page, 'john');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  let checkouts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/api/billing/checkout')) {
      checkouts += 1;
    }
  });

  await openPublicTemplate(page);

  await expect(page.getByRole('button', { name: 'Upgrade to save' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upgrade to copy template' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  expect(checkouts).toBe(0);
});
