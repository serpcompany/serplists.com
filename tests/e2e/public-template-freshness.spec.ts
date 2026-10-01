import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { navigateInApp } from './support/navigation';
import { fillSignInForm } from './support/sign-in';

const NEW_TEMPLATE_VERSION = 1;

async function loginAsAdmin(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function callApi(page: Page, method: string, path: string, body?: unknown) {
  return apiJson<Record<string, unknown>>(page, path, { method, body });
}

async function loadPublicCatalogIntoMemory(page: Page) {
  await page.goto('/templates/');
  await expect(page.getByRole('heading', { name: 'Template Library' })).toBeVisible();
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
  const publicPath = `/profile/admin/${String(created.slug)}/`;

  try {
    await loadPublicCatalogIntoMemory(page);

    await callApi(page, 'PUT', `/templates/${templateId}`, {
      title: `Freshness Edited ${stamp}`,
      expected_version: NEW_TEMPLATE_VERSION,
    });
    await navigateInApp(page, publicPath);
    await expect(page.getByRole('heading', { level: 1, name: `Freshness Edited ${stamp}` })).toBeVisible();

    await callApi(page, 'PUT', `/templates/${templateId}`, { is_public: false });
    await navigateInApp(page, '/templates/');
    await navigateInApp(page, publicPath);
    await expect(page.getByRole('heading', { name: 'Template not found' })).toBeVisible();
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
