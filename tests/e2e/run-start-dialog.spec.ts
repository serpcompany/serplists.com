import { expect, test, type Page } from '@playwright/test';

import { apiJson, apiRequest } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// The Start Run dialog used to clear the run name as soon as it was submitted, so a start
// that failed (network, 429, 5xx, an Organization plan limit) left the dialog open with the
// name gone, and a retry silently used the generated default (src/components/ui/run-name-dialog.tsx).

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function createTemplate(page: Page, title: string) {
  const template = await apiJson<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: {
      title,
      sections: [{ id: 'start', title: 'Section', items: [{ id: 'start-a', title: 'Task A' }] }],
      is_public: false,
    },
  });
  return template.id;
}

async function deleteResource(page: Page, path: string) {
  await apiRequest(page, path, { method: 'DELETE' });
}

test('a failed start keeps the typed run name, and the retry uses it', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createTemplate(page, `Start dialog QA ${Date.now()}`);
  const runName = `Q3 vendor onboarding ${Date.now()}`;
  let refuseNextStart = true;
  await page.route('**/api/checklists', async (route) => {
    if (route.request().method() === 'POST' && refuseNextStart) {
      refuseNextStart = false;
      await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Too many requests' }) });
      return;
    }
    await route.continue();
  });

  await page.goto(`/dashboard/templates/${templateId}`);
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Name Your Checklist Run' });
  const nameField = dialog.getByRole('textbox', { name: 'Run Name' });
  await nameField.fill(runName);
  await dialog.getByRole('button', { name: 'Start Checklist' }).click();

  await expect.poll(() => refuseNextStart).toBe(false);
  await expect(dialog).toBeVisible();
  await expect(nameField).toHaveValue(runName);

  await dialog.getByRole('button', { name: 'Start Checklist' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);
  const runId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? '');
  const { title } = await apiJson<{ title: string }>(page, `/checklists/${runId}`);
  expect(title).toBe(runName);

  await deleteResource(page, `/checklists/${runId}`);
  await deleteResource(page, `/templates/${templateId}`);
});

test('a cancelled Start Run dialog opens empty next time', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createTemplate(page, `Start dialog cancel QA ${Date.now()}`);

  await page.goto(`/dashboard/templates/${templateId}`);
  const dialog = page.getByRole('dialog', { name: 'Name Your Checklist Run' });
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  await dialog.getByRole('textbox', { name: 'Run Name' }).fill('Not this one');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Start Run' }).first().click();
  await expect(dialog.getByRole('textbox', { name: 'Run Name' })).toHaveValue('');

  await deleteResource(page, `/templates/${templateId}`);
});
