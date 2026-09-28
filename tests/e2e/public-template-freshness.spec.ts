import { expect, test, type Page } from '@playwright/test';

// The public template page must show the server's copy, not the catalog another page
// loaded earlier in the same tab (docs/FRONTEND.md).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

// Navigates inside the app, so in-memory lists survive (no reload).
async function navigateInApp(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
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

test('shows edits and unpublishing on a public template page after the catalog loaded', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const created = await callApi(page, 'POST', '/templates', {
    title: `Freshness Original ${stamp}`,
    slug: `freshness-check-${stamp}`,
    is_public: true,
    sections: [{ id: 'fresh-section', title: 'Original section', items: [{ id: 'fresh-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);
  const publicPath = `/profile/admin/${String(created.slug)}`;

  try {
    // Loads the public catalog into memory for the rest of the tab session.
    await page.goto('/templates');
    await expect(page.getByRole('heading', { name: 'Discover Templates' })).toBeVisible();

    await callApi(page, 'PUT', `/templates/${templateId}`, { title: `Freshness Edited ${stamp}` });
    await navigateInApp(page, publicPath);
    await expect(page.getByRole('heading', { level: 1, name: `Freshness Edited ${stamp}` })).toBeVisible();

    await callApi(page, 'PUT', `/templates/${templateId}`, { is_public: false });
    await navigateInApp(page, '/templates');
    await navigateInApp(page, publicPath);
    await expect(page.getByRole('heading', { name: 'Template not found' })).toBeVisible();
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
