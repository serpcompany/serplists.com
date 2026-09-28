import { expect, test, type Page } from '@playwright/test';

// A task removed from a Template keeps its completion and notes on the Run, read-only
// under "Removed from Template", and the Run's Changelog records the reconcile.

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function api<T>(page: Page, path: string, method: string, body?: unknown): Promise<T> {
  return page.evaluate(async ({ apiBaseUrl, requestPath, requestMethod, requestBody }) => {
    const response = await fetch(`${apiBaseUrl}${requestPath}`, {
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: requestMethod,
    });
    if (!response.ok) throw new Error(`${requestMethod} ${requestPath} failed: ${response.status}`);
    return response.json();
  }, { apiBaseUrl: DEV_API_BASE_URL, requestPath: path, requestMethod: method, requestBody: body }) as Promise<T>;
}

test('notes on a task removed from the Template stay visible on the Run', async ({ page }) => {
  await loginAsAdmin(page);
  const suffix = Date.now();
  const sections = [{
    id: `retired-${suffix}`,
    title: 'Launch',
    items: [
      { id: `retired-dns-${suffix}`, title: 'Check DNS' },
      { id: `retired-copy-${suffix}`, title: 'Write copy' },
    ],
  }];
  const template = await api<{ id: string }>(page, '/templates', 'POST', {
    title: `Retired work QA ${suffix}`,
    sections,
    is_public: false,
  });
  const run = await api<{ id: string }>(page, '/checklists', 'POST', { template_id: template.id, title: `Retired run ${suffix}` });

  await page.goto(`/dashboard/runs/${run.id}`);
  await expect(page.getByRole('heading', { name: 'Check DNS' })).toBeVisible();
  await page.getByLabel('Task notes').fill('Registrar login is in vault X; TTL lowered to 300');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Write copy' })).toBeVisible();

  // A content edit names the version it was based on (the API refuses one without it).
  const { version } = await api<{ version: number }>(page, `/templates/${template.id}`, 'GET');
  await api(page, `/templates/${template.id}`, 'PUT', {
    sections: [{ ...sections[0], items: [sections[0].items[1]] }],
    expected_version: version,
  });

  await page.reload();
  await expect(page.getByText('0 of 1 tasks finished')).toBeVisible();
  const retired = page.locator('[data-retired-run-items="true"]');
  await retired.getByText('Removed from Template (1)').click();
  await expect(retired.getByText('Check DNS')).toBeVisible();
  await expect(retired.getByText('Registrar login is in vault X; TTL lowered to 300')).toBeVisible();
  await expect(retired.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Updated from Template')).toBeVisible();

  await api(page, `/checklists/${run.id}`, 'DELETE');
  await api(page, `/templates/${template.id}`, 'DELETE');
});
