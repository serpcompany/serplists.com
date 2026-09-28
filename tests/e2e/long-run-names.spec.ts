import { expect, test, type Page } from '@playwright/test';

// A template title may use the whole 160-character limit that run titles share, so the
// default run name shortens the title instead of failing (src/lib/runs/runName.ts).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function callApi(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(async ({ apiBaseUrl, requestBody, requestMethod, requestPath }) => {
    const response = await fetch(`${apiBaseUrl}${requestPath}`, {
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: requestMethod,
    });
    if (!response.ok) throw new Error(`${requestMethod} ${requestPath} failed: ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }, { apiBaseUrl: DEV_API_BASE_URL, requestBody: body, requestMethod: method, requestPath: path });
}

test('Start Run on a public template with a 160-character title creates the run', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = String(Date.now());
  const title = `Long ${stamp} `.padEnd(160, 'x');
  const created = await callApi(page, 'POST', '/templates', {
    title,
    slug: `long-run-name-${stamp}`,
    is_public: true,
    sections: [{ id: 'long-section', title: 'Section', items: [{ id: 'long-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);
  let runId: string | undefined;

  try {
    await page.goto(`/profile/admin/${String(created.slug)}`);
    await page.getByRole('button', { name: 'Start Run' }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/runs\/[^/]+$/);
    runId = new URL(page.url()).pathname.split('/').pop();

    const run = await callApi(page, 'GET', `/checklists/${runId}`);
    expect(String(run.title).length).toBeLessThanOrEqual(160);
    expect(String(run.title).startsWith(`Long ${stamp}`)).toBe(true);
  } finally {
    if (runId) await callApi(page, 'DELETE', `/checklists/${runId}`);
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
