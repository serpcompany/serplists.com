import { expect, test, type Page } from '@playwright/test';

import { apiRequest } from './support/api-requests';
import { navigateInApp } from './support/navigation';
import { fillSignInForm } from './support/sign-in';

// Deleting a Template or Run archives it. The archive page, opened from the console
// navigation, lists archived items and restores them (src/views/Archive.tsx).

async function loginAsAdmin(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

// One archive row. The two archive lists sit in a grid of their own, so only the innermost
// grid holding the title is a row.
function archiveRow(page: Page, title: string) {
  return page.locator('div.grid').filter({ hasText: title }).filter({ hasNot: page.locator('div.grid') });
}

test('an archived template and run can be restored from the archive page', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const templateTitle = `Archive restore template ${stamp}`;
  const runTitle = `Archive restore run ${stamp}`;
  const sections = [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }];

  const template = await apiRequest<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: { title: templateTitle, is_public: false, sections },
  });
  const templateId = template.body?.id as string;
  const run = await apiRequest<{ id: string }>(page, '/checklists', { method: 'POST', body: { title: runTitle, sections } });
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

// Another tab or a teammate restored the item while this page still listed it. Restore here
// failed with "Template is not archived" on every click and the row stayed until a reload.
test('an item restored elsewhere leaves the archive when Restore finds it already restored', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Archive restored elsewhere ${Date.now()}`;
  const sections = [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }];
  const template = await apiRequest<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: { title, is_public: false, sections },
  });
  const templateId = template.body?.id as string;
  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);

  await page.goto('/dashboard/archive/');
  const row = archiveRow(page, title);
  await expect(row).toHaveCount(1, { timeout: 15_000 });

  // Restored elsewhere. The archive list is fresh for a minute, so this page still shows it.
  expect((await apiRequest(page, `/templates/${templateId}/restore`, { method: 'POST' })).status).toBe(200);

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

  // Load the archive first so its lists are cached, then delete from the runs page.
  await page.goto('/dashboard/archive/');
  await expect(page.getByRole('heading', { name: 'Archived runs' })).toBeVisible();
  // The count replaces "Loading" once both archive lists have loaded.
  await expect(page.getByText(/^\d+ archived$/)).toBeVisible();
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  const runRow = page.locator('div').filter({ hasText: runTitle }).filter({ has: page.getByRole('button', { name: 'Run options' }) }).last();
  await expect(runRow).toBeVisible({ timeout: 15_000 });
  await runRow.getByRole('button', { name: 'Run options' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  // Users see a delete; the run stays restorable from the archive, so the dialog never says
  // "cannot be undone".
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Delete run' })).toBeVisible();
  await expect(dialog).toContainText('Are you sure you want to delete this run?');
  await expect(dialog).not.toContainText('cannot be undone');
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'DELETE',
  );
  await dialog.getByRole('button', { name: 'Delete' }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByText('Run deleted')).toBeVisible();

  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  await expect(archiveRow(page, runTitle)).toHaveCount(1, { timeout: 15_000 });
});

// My Templates said a deleted template "cannot be undone", though it only moves to the archive.
test('a template deleted from My Templates never says it cannot be undone and restores from the archive', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Archive from list template ${Date.now()}`;
  const sections = [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }];
  const template = await apiRequest<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: { title, is_public: false, sections },
  });
  const templateId = template.body?.id as string;

  await page.goto('/dashboard/templates/');
  await page.getByPlaceholder('Search templates...').fill(title);
  await page.getByRole('button', { name: 'Show templates in list view' }).click();
  const row = page.locator('div.group').filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.hover();
  await row.getByRole('button', { name: 'Delete' }).click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('heading', { name: 'Delete template' })).toBeVisible();
  await expect(dialog).toContainText('Are you sure you want to delete this template?');
  await expect(dialog).not.toContainText('cannot be undone');
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'DELETE',
  );
  await dialog.getByRole('button', { name: 'Delete' }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByText('Template deleted')).toBeVisible();

  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  const archived = archiveRow(page, title);
  await expect(archived).toHaveCount(1, { timeout: 15_000 });
  await archived.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Template restored')).toBeVisible();
  expect((await apiRequest(page, `/templates/${templateId}`)).status).toBe(200);

  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);
});

// Deleting from the template's own page refetched it while the page was still open: a
// GET that could only 404, whose "gone" answer stayed cached, so the restored template
// first opened as "Template Not Found".
test('a template deleted from its page opens normally once restored', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Archive detail template ${Date.now()}`;
  const sections = [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }];
  const template = await apiRequest<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: { title, is_public: false, sections },
  });
  const templateId = template.body?.id as string;
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
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'DELETE',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
  await page.waitForTimeout(500);
  expect(readsAfterArchive).toEqual([]);

  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  const row = archiveRow(page, title);
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Template restored')).toBeVisible();

  // Hold the next read so a cached "gone" answer would show while it runs.
  await page.route(
    (url) => url.pathname.endsWith(`/api/templates/${templateId}`),
    async (route) => {
      if (route.request().method() === 'GET') await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fallback();
    },
  );
  // In-app navigation keeps the query cache.
  await navigateInApp(page, `/dashboard/templates/${templateId}/`);
  await page.waitForTimeout(700);
  await expect(page.getByText('Template Not Found')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible({ timeout: 15_000 });

  expect((await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' })).status).toBe(200);
});
