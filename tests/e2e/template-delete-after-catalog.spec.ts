import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';

// My Templates merges the user's own list with the cached public catalog (docs/FRONTEND.md).
// A Template deleted after a page loaded the catalog must leave My Templates at once, without
// a reload, even though the catalog copy is still cached.

async function navigateInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test('a deleted public template leaves My Templates after the catalog was loaded', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  const title = `Catalog delete ${Date.now()}`;
  const { id: templateId } = await apiJson<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: {
      title,
      is_public: true,
      sections: [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }],
    },
  });

  // The runs page loads the public catalog, which now includes the new public template.
  const catalogLoaded = page.waitForResponse((response) => response.url().includes('/api/templates?scope=public'));
  await page.goto('/dashboard/runs');
  await catalogLoaded;

  await navigateInApp(page, '/dashboard/templates');
  await page.getByPlaceholder('Search templates...').fill(title);
  await page.getByRole('button', { name: 'Show templates in grid view' }).click();
  const card = page.locator('div.group').filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await expect(card).toHaveCount(1, { timeout: 15_000 });

  await card.hover();
  await card.getByRole('button').first().click();
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'DELETE',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Archive' }).click();
  expect((await deleted).status()).toBe(200);

  await expect(page.getByText('Template archived')).toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0, { timeout: 15_000 });
});

// The edge cache can answer the catalog request with the pre-delete copy for up to 5 minutes.
// Deleting a Template drops it from the cached catalog, and that copy must stay: a refetch on
// the next library visit would bring the deleted Template back.
test('a deleted public template stays off the library while the edge still serves the old catalog', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });

  const title = `Catalog edge delete ${Date.now()}`;
  const { id: templateId } = await apiJson<{ id: string }>(page, '/templates', {
    method: 'POST',
    body: {
      title,
      is_public: true,
      sections: [{ id: 'section-1', title: 'Section', items: [{ id: 'item-1', title: 'Task' }] }],
    },
  });
  // The list row carries the owner's username, which the library needs to list it.
  const ownRows = await apiJson<Array<Record<string, unknown>>>(page, '/templates?scope=personal');
  const storedRow = ownRows.find((row) => row.id === templateId);
  expect(storedRow?.owner_username).toBeTruthy();

  // Every catalog answer still lists the template, as an edge copy stored before the delete would.
  let catalogRequests = 0;
  await page.route('**/api/templates?scope=public*', async (route) => {
    catalogRequests += 1;
    const response = await route.fetch();
    const rows = (await response.json()) as Array<Record<string, unknown>>;
    const json = rows.some((row) => row.id === templateId) ? rows : [storedRow, ...rows];
    await route.fulfill({ response, json });
  });

  const search = `/templates?search=${encodeURIComponent(title)}`;
  await page.goto(search);
  const card = page.getByRole('heading', { name: title, exact: true });
  await expect(card).toBeVisible({ timeout: 15_000 });
  const requestsBeforeDelete = catalogRequests;

  await navigateInApp(page, `/dashboard/templates/${templateId}`);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const deleted = page.waitForResponse(
    (response) => response.url().includes(`/api/templates/${templateId}`) && response.request().method() === 'DELETE',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
  expect((await deleted).status()).toBe(200);
  await expect(page.getByText('Template archived')).toBeVisible();

  await navigateInApp(page, search);
  await expect(page.getByPlaceholder('Search templates...')).toHaveValue(title);
  await expect(page.getByRole('heading', { name: 'No templates found', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveCount(0);
  expect(catalogRequests).toBe(requestsBeforeDelete);
});
