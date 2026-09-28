import { expect, test, type Page } from '@playwright/test';

// Deleting a Template or Run archives it. The archive page, opened from the console
// navigation, lists archived items and restores them (src/pages/Archive.tsx).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function apiRequest(page: Page, path: string, method: string, body?: unknown) {
  return page.evaluate(async ({ apiBaseUrl, requestPath, requestMethod, requestBody }) => {
    const response = await fetch(`${apiBaseUrl}${requestPath}`, {
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: requestMethod,
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as { id?: string } | null };
  }, { apiBaseUrl: DEV_API_BASE_URL, requestPath: path, requestMethod: method, requestBody: body });
}

test('an archived template and run can be restored from the archive page', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const templateTitle = `Archive restore template ${stamp}`;
  const runTitle = `Archive restore run ${stamp}`;
  const sections = [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }];

  const template = await apiRequest(page, '/templates', 'POST', { title: templateTitle, is_public: false, sections });
  const templateId = template.body?.id as string;
  const run = await apiRequest(page, '/checklists', 'POST', { title: runTitle, sections });
  const runId = run.body?.id as string;
  expect((await apiRequest(page, `/templates/${templateId}`, 'DELETE')).status).toBe(200);
  expect((await apiRequest(page, `/checklists/${runId}`, 'DELETE')).status).toBe(200);

  await page.goto('/dashboard/templates');
  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/archive$/);
  await expect(page.getByRole('heading', { name: 'Archive', exact: true })).toBeVisible();

  const templateRow = page.locator('div.grid').filter({ hasText: templateTitle });
  await expect(templateRow).toHaveCount(1, { timeout: 15_000 });
  await templateRow.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('Template restored')).toBeVisible();
  await expect(page.getByText(templateTitle)).toHaveCount(0);

  const runRow = page.locator('div.grid').filter({ hasText: runTitle });
  await expect(runRow).toHaveCount(1);
  await runRow.getByRole('button', { name: 'Restore' }).dblclick();
  await expect(page.getByText('Run restored')).toBeVisible();
  await expect(page.getByText(runTitle)).toHaveCount(0);

  expect((await apiRequest(page, `/templates/${templateId}`, 'GET')).status).toBe(200);
  expect((await apiRequest(page, `/checklists/${runId}`, 'GET')).status).toBe(200);

  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  await expect(page.getByText(runTitle)).toBeVisible({ timeout: 15_000 });
});

test('a deleted run appears in the archive without a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const runTitle = `Archive refresh run ${Date.now()}`;
  const run = await apiRequest(page, '/checklists', 'POST', {
    title: runTitle,
    sections: [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }],
  });
  const runId = run.body?.id as string;

  // Load the archive first so its lists are cached, then delete from the runs page.
  await page.goto('/dashboard/archive');
  await expect(page.getByText('Archived runs')).toBeVisible();
  await page.getByRole('link', { name: 'Runs', exact: true }).first().click();
  const runRow = page.locator('div').filter({ hasText: runTitle }).filter({ has: page.getByRole('button', { name: 'Run options' }) }).last();
  await expect(runRow).toBeVisible({ timeout: 15_000 });
  await runRow.getByRole('button', { name: 'Run options' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'DELETE',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  expect((await deleted).status()).toBe(200);

  await page.getByRole('link', { name: 'Archive', exact: true }).first().click();
  await expect(page.locator('div.grid').filter({ hasText: runTitle })).toHaveCount(1, { timeout: 15_000 });
});
