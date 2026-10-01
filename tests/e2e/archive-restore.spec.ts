import { expect, test, type Page } from '@playwright/test';

import { apiRequest } from './support/api-requests';
import { navigateInApp } from './support/navigation';
import { loginAsAdmin } from './support/sign-in';
import { confirmTheTemplateDelete, createOneTaskTemplate, ONE_TASK_SECTIONS } from './support/template-editor';

const LATE_READ_WINDOW_MS = 500;
const DELAYED_READ_MS = 1_500;
const CACHED_ANSWER_WINDOW_MS = 700;

function archiveRow(page: Page, title: string) {
  return page.getByRole('listitem').filter({ hasText: title });
}

async function restoreTemplateElsewhere(page: Page, templateId: string) {
  expect((await apiRequest(page, `/templates/${templateId}/restore`, { method: 'POST' })).status).toBe(200);
}

async function loadArchiveListsIntoCache(page: Page) {
  await page.goto('/dashboard/archive/');
  await expect(page.getByRole('heading', { name: 'Archived runs' })).toBeVisible();
  await expect(page.getByText(/^\d+ archived$/)).toBeVisible();
}

async function expectDeleteDialogThatKeepsItRestorable(page: Page, kind: 'run' | 'template') {
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: `Delete ${kind}` })).toBeVisible();
  await expect(dialog).toContainText(`Are you sure you want to delete this ${kind}?`);
  await expect(dialog).not.toContainText('cannot be undone');
  return dialog;
}

async function delayTemplateReads(page: Page, templateId: string) {
  await page.route(
    (url) => url.pathname.endsWith(`/api/templates/${templateId}`),
    async (route) => {
      if (route.request().method() === 'GET') await new Promise((resolve) => setTimeout(resolve, DELAYED_READ_MS));
      await route.fallback();
    },
  );
}

test('an archived template and run can be restored from the archive page', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const templateTitle = `Archive restore template ${stamp}`;
  const runTitle = `Archive restore run ${stamp}`;

  const templateId = await createOneTaskTemplate(page, templateTitle, false);
  const run = await apiRequest<{ id: string }>(page, '/checklists', { method: 'POST', body: { title: runTitle, sections: ONE_TASK_SECTIONS } });
  const runId = run.body?.id as string;
  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);
  expect((await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' })).status).toBe(200);

  await page.goto('/dashboard/templates/');
  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/archive\/$/);
  await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();

  const templateRow = archiveRow(page, templateTitle);
  await expect(templateRow).toHaveCount(1, { timeout: 15_000 });
  await templateRow.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Template restored')).toBeVisible();
  await expect(page.getByText(templateTitle)).toHaveCount(0);

  const runRow = archiveRow(page, runTitle);
  await expect(runRow).toHaveCount(1);
  await runRow.getByRole('button', { name: 'Restore' }).dblclick();
  await expect(page.getByText('Run restored')).toBeVisible();
  await expect(page.getByText(runTitle)).toHaveCount(0);

  expect((await apiRequest(page, `/templates/${templateId}`)).status).toBe(200);
  expect((await apiRequest(page, `/checklists/${runId}`)).status).toBe(200);

  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  await expect(page.getByText(runTitle)).toBeVisible({ timeout: 15_000 });
});

test('an item restored elsewhere leaves the archive when Restore finds it already restored', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Archive restored elsewhere ${Date.now()}`;
  const templateId = await createOneTaskTemplate(page, title, false);
  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);

  await page.goto('/dashboard/archive/');
  const row = archiveRow(page, title);
  await expect(row).toHaveCount(1, { timeout: 15_000 });

  await restoreTemplateElsewhere(page, templateId);

  const refused = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${templateId}/restore`) && response.request().method() === 'POST',
  );
  await row.getByRole('button', { name: 'Restore' }).click();
  expect((await refused).status()).toBe(400);
  await expect(page.getByText('This template was already restored. The list was refreshed.')).toBeVisible();
  await expect(archiveRow(page, title)).toHaveCount(0, { timeout: 15_000 });

  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);
});

test('a deleted run appears in the archive without a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const runTitle = `Archive refresh run ${Date.now()}`;
  const run = await apiRequest<{ id: string }>(page, '/checklists', {
    method: 'POST',
    body: {
      title: runTitle,
      sections: [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }],
    },
  });
  const runId = run.body?.id as string;

  await loadArchiveListsIntoCache(page);
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  const runRow = page.locator('div').filter({ hasText: runTitle }).filter({ has: page.getByRole('button', { name: 'Run options' }) }).last();
  await expect(runRow).toBeVisible({ timeout: 15_000 });
  await runRow.getByRole('button', { name: 'Run options' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const dialog = await expectDeleteDialogThatKeepsItRestorable(page, 'run');
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'DELETE',
  );
  await dialog.getByRole('button', { name: 'Delete' }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByText('Run deleted')).toBeVisible();

  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  await expect(archiveRow(page, runTitle)).toHaveCount(1, { timeout: 15_000 });
});

test('a template deleted from My Templates never says it cannot be undone and restores from the archive', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Archive from list template ${Date.now()}`;
  const templateId = await createOneTaskTemplate(page, title, false);

  await page.goto('/dashboard/templates/');
  await page.getByPlaceholder('Search templates...').fill(title);
  await page.getByRole('button', { name: 'Show templates in list view' }).click();
  const row = page.locator('div.group').filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();

  const dialog = await expectDeleteDialogThatKeepsItRestorable(page, 'template');
  await confirmTheTemplateDelete(page, templateId, dialog);
  await expect(page.getByText('Template deleted')).toBeVisible();

  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  const archived = archiveRow(page, title);
  await expect(archived).toHaveCount(1, { timeout: 15_000 });
  await archived.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Template restored')).toBeVisible();
  expect((await apiRequest(page, `/templates/${templateId}`)).status).toBe(200);

  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);
});

test('a template deleted from its page is not read again and opens normally once restored', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Archive detail template ${Date.now()}`;
  const templateId = await createOneTaskTemplate(page, title, false);
  const isDetailRead = (url: URL, method: string) =>
    method === 'GET' && url.pathname.endsWith(`/api/templates/${templateId}`);

  await page.goto(`/dashboard/templates/${templateId}/`);
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({ timeout: 15_000 });

  const readsAfterArchive: string[] = [];
  page.on('request', (request) => {
    if (isDetailRead(new URL(request.url()), request.method())) readsAfterArchive.push(request.url());
  });
  await page.getByRole('button', { name: 'Template actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await confirmTheTemplateDelete(page, templateId);
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
  await page.waitForTimeout(LATE_READ_WINDOW_MS);
  expect(readsAfterArchive).toEqual([]);

  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  const row = archiveRow(page, title);
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Template restored')).toBeVisible();

  await delayTemplateReads(page, templateId);
  await navigateInApp(page, `/dashboard/templates/${templateId}/`);
  await page.waitForTimeout(CACHED_ANSWER_WINDOW_MS);
  await expect(page.getByText('Template Not Found')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({ timeout: 15_000 });

  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);
});
