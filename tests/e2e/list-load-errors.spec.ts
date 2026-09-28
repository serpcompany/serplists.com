import { expect, test, type Page, type Route } from '@playwright/test';

// A failed list request must show an error with Retry, never the "nothing here" empty state,
// and Retry must load the list (docs/FRONTEND.md).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function apiRequest<T>(page: Page, path: string, init: { method: string; body?: unknown }): Promise<T> {
  return page.evaluate(async ({ url, method, body }) => {
    const response = await fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method,
    });
    if (!response.ok) throw new Error(`${method} ${url} failed: ${response.status}`);
    return response.json();
  }, { url: `${DEV_API_BASE_URL}${path}`, method: init.method, body: init.body });
}

// Fails matching GET requests with a 500 until `failing.value` is set to false.
async function failRequests(page: Page, matches: (url: URL) => boolean) {
  const failing = { value: true };
  await page.route(matches, (route: Route) =>
    failing.value && route.request().method() === 'GET'
      ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal error' }) })
      : route.fallback(),
  );
  return failing;
}

test('My Templates shows Retry instead of an empty library when the list fails to load', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Load error template ${Date.now()}`;
  const { id } = await apiRequest<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: { title, is_public: false, sections: [{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task' }] }] },
  });

  const failing = await failRequests(
    page,
    (url) => url.pathname.endsWith('/api/templates') && url.searchParams.get('scope') === 'personal',
  );
  await page.goto('/dashboard/templates');

  await expect(page.getByText("Couldn't load your templates")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No templates found')).toHaveCount(0);

  failing.value = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible({ timeout: 15_000 });

  await apiRequest(page, `/templates/${id}`, { method: 'DELETE' });
});

test('My Runs shows Retry instead of an empty list when the runs fail to load', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Load error run ${Date.now()}`;
  const { id } = await apiRequest<{ id: string }>(page, '/checklists', {
    method: 'POST',
    body: { title, sections: [{ id: 's1', title: 'Section', items: [{ id: 'i1', title: 'Task' }] }] },
  });

  const failing = await failRequests(page, (url) => url.pathname.endsWith('/api/checklists'));
  await page.goto('/dashboard/runs');

  await expect(page.getByText("Couldn't load your runs")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('No runs found')).toHaveCount(0);

  failing.value = false;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 });

  await apiRequest(page, `/checklists/${id}`, { method: 'DELETE' });
});
