import { expect, test, type Page } from '@playwright/test';

// The visibility switch sends the version of the template the page shows. When someone else
// saved the template meanwhile, the server answers 409 edit_conflict. The page reloads the
// template, so the next click succeeds without a page reload (docs/product-specs/features.md).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function apiRequest(page: Page, path: string, method: string, body?: unknown) {
  return page.evaluate(async ({ url, requestMethod, payload }) => {
    const response = await fetch(url, {
      body: payload === undefined ? undefined : JSON.stringify(payload),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: requestMethod,
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null };
  }, { url: `${DEV_API_BASE_URL}${path}`, requestMethod: method, payload: body });
}

test('the visibility switch recovers from an edit conflict without a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Conflict QA ${Date.now()}`;
  const created = await apiRequest(page, '/templates', 'POST', {
    title,
    sections: [{ id: 'conflict-section', title: 'Section', items: [{ id: 'conflict-task', title: 'Task' }] }],
  });
  expect(created.status).toBe(200);
  const templateId = String(created.body?.id);

  await page.goto(`/dashboard/templates/${templateId}`);
  const visibility = page.getByRole('switch');
  await expect(visibility).toBeEnabled({ timeout: 15_000 });

  // Another tab or member saves the template: its version moves on.
  const renamed = await apiRequest(page, `/templates/${templateId}`, 'PUT', { title: `${title} renamed`, expected_version: 1 });
  expect(renamed.status).toBe(200);

  await visibility.click();
  await expect(page.getByText('This template changed elsewhere. It was reloaded; try again.')).toBeVisible();
  await expect(visibility).toBeEnabled();

  const saved = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'PUT',
  );
  await visibility.click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByText('Template is now public')).toBeVisible();

  await apiRequest(page, `/templates/${templateId}`, 'DELETE');
});
