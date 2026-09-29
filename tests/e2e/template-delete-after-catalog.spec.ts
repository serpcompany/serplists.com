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
