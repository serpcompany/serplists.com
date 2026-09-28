import { expect, test, type Page } from '@playwright/test';

// The template detail page shows the visibility the server holds after the switch and
// Share are used together, and each later change is accepted (no stale version).

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

test('shows Public after Share follows a switch to Private', async ({ page }) => {
  await loginAsAdmin(page);
  const created = await callApi(page, 'POST', '/templates', {
    title: `Visibility QA ${Date.now()}`,
    is_public: true,
    sections: [{ id: 'visibility-section', title: 'Section', items: [{ id: 'visibility-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);

  try {
    await page.goto(`/dashboard/templates/${templateId}`);
    const visibilitySwitch = page.getByRole('switch');
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'true');

    await visibilitySwitch.click();
    await expect(page.getByText('Template is now private')).toBeVisible();
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: 'Share' }).click();
    const dialog = page.getByRole('dialog', { name: 'Share Template' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).first().click();

    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Public', { exact: true }).first()).toBeVisible();

    // A later change is accepted: the page did not keep an outdated version.
    await visibilitySwitch.click();
    await expect(page.getByText('Template is now private')).toBeVisible();
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false');
    const saved = await callApi(page, 'GET', `/templates/${templateId}`);
    expect(Boolean(saved.is_public)).toBe(false);
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
