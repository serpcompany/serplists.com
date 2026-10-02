import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';

import { apiJson } from './support/api-requests';
import { navigateInApp } from './support/navigation';
import { loginAsAdmin } from './support/sign-in';
import { confirmTheTemplateDelete, createOneTaskTemplate } from './support/template-editor';

interface CatalogRow extends Record<string, unknown> {
  id?: unknown;
  owner_username?: unknown;
}

const catalogRowsSchema = z.array(z.record(z.unknown()).transform((row): CatalogRow => row));

async function loadThePublicCatalogFromTheRunsPage(page: Page) {
  const catalogLoaded = page.waitForResponse((response) => response.url().includes('/api/templates?scope=public'));
  await page.goto('/dashboard/runs/');
  await catalogLoaded;
}

async function serveTheEdgeCopyFromBeforeTheDelete(page: Page, templateId: string, rowBeforeDelete: unknown) {
  const catalog = { requests: 0 };
  await page.route('**/api/templates?scope=public*', async (route) => {
    catalog.requests += 1;
    const response = await route.fetch();
    const rows = catalogRowsSchema.parse(await response.json());
    const json = rows.some((row) => row.id === templateId) ? rows : [rowBeforeDelete, ...rows];
    await route.fulfill({ response, json });
  });
  return catalog;
}

test('a deleted public template leaves My Templates after the catalog was loaded', async ({ page }) => {
  await loginAsAdmin(page);

  const title = `Catalog delete ${Date.now()}`;
  const templateId = await createOneTaskTemplate(page, title, true);

  await loadThePublicCatalogFromTheRunsPage(page);

  await navigateInApp(page, '/dashboard/templates/');
  await page.getByPlaceholder('Search templates...').fill(title);
  await page.getByRole('button', { name: 'Show templates in grid view' }).click();
  const card = page.locator('article').filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await expect(card).toHaveCount(1, { timeout: 15_000 });

  await card.hover();
  await card.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await confirmTheTemplateDelete(page, templateId);

  await expect(page.getByText('Template deleted')).toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0, { timeout: 15_000 });
});

test('a deleted public template stays off the library while the edge still serves the old catalog', async ({ page }) => {
  await loginAsAdmin(page);

  const title = `Catalog edge delete ${Date.now()}`;
  const templateId = await createOneTaskTemplate(page, title, true);
  const ownRows = await apiJson(page, '/templates?scope=personal', catalogRowsSchema);
  const rowTheLibraryCanList = ownRows.find((row) => row.id === templateId);
  expect(rowTheLibraryCanList?.owner_username).toBeTruthy();
  const catalog = await serveTheEdgeCopyFromBeforeTheDelete(page, templateId, rowTheLibraryCanList);

  const search = `/templates/?search=${encodeURIComponent(title)}`;
  await page.goto(search);
  const card = page.getByRole('heading', { name: title, exact: true });
  await expect(card).toBeVisible({ timeout: 15_000 });
  const requestsBeforeDelete = catalog.requests;

  await navigateInApp(page, `/dashboard/templates/${templateId}/`);
  await page.getByRole('button', { name: 'Template actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await confirmTheTemplateDelete(page, templateId);
  await expect(page.getByText('Template deleted')).toBeVisible();

  await navigateInApp(page, search);
  await expect(page.getByPlaceholder('Search templates...')).toHaveValue(title);
  await expect(page.getByRole('heading', { name: 'No templates found', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(card).toHaveCount(0);
  expect(catalog.requests).toBe(requestsBeforeDelete);
});
