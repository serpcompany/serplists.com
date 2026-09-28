import { expect, test, type Page } from '@playwright/test';

// Share, archive and restore create no template version, only an audit event; the
// Changelog must still show them (src/features/template-detail/templateHistoryTimeline.ts).

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

test('the Changelog shows Share, archive and restore next to versions', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const created = await callApi(page, 'POST', '/templates', {
    title: `Changelog ${stamp}`,
    slug: `changelog-${stamp}`,
    is_public: false,
    sections: [{ id: 'log-section', title: 'Section', items: [{ id: 'log-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);

  try {
    await page.goto(`/dashboard/templates/${templateId}`);
    await expect(page.getByText('Created template v1')).toBeVisible();

    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('button', { name: 'Close' }).first().click();
    // No reload: the Changelog refreshes after Share.
    await expect(page.getByText('Made template public')).toBeVisible();

    await callApi(page, 'DELETE', `/templates/${templateId}`);
    await callApi(page, 'POST', `/templates/${templateId}/restore`, {});
    await page.reload();

    await expect(page.getByText('Restored template')).toBeVisible();
    await expect(page.getByText('Archived template')).toBeVisible();
    await expect(page.getByText('Made template public')).toBeVisible();
    await expect(page.getByText('Created template v1')).toBeVisible();
    await expect(page.getByText(/^Created template/)).toHaveCount(1);
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
