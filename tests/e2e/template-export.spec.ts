import { expect, test, type Page } from '@playwright/test';

// Each export reads every Template in the context, plus every public one when asked, so
// a double click on Export Portable Pack must send one request and download one file
// (docs/product-specs/portable-templates.md).

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

const exportedPack = JSON.stringify({
  kind: 'serplists-template-pack',
  schemaVersion: '2.0.0',
  exportedAt: '2026-03-22T00:00:00.000Z',
  templates: [{ title: 'Export Guard', sections: [{ title: 'Prep', items: [{ title: 'Task' }] }] }],
});

test('a double click on Export Portable Pack runs one export and downloads one file', async ({ page }) => {
  await loginAsAdmin(page);
  await page.route('**/api/billing/status**', (route) =>
    route.fulfill({
      body: JSON.stringify({ billingEnabled: true, plan: 'pro' }),
      contentType: 'application/json',
      status: 200,
    }),
  );

  let exportRequests = 0;
  let releaseExport!: () => void;
  const exportReleased = new Promise<void>((resolve) => {
    releaseExport = resolve;
  });
  await page.route('**/api/templates/backup**', async (route) => {
    exportRequests += 1;
    await exportReleased;
    await route.fulfill({ body: exportedPack, contentType: 'application/json', status: 200 });
  });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));

  await page.goto('/dashboard/import-templates');
  const exportButton = page.getByRole('button', { name: 'Export Portable Pack' });
  await expect(exportButton).toBeEnabled({ timeout: 15_000 });

  await exportButton.dblclick();
  await expect(page.getByRole('button', { name: 'Exporting...' })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Include public community templates' })).toBeDisabled();

  releaseExport();
  await expect(page.getByText('Exported 1 template successfully')).toBeVisible();
  await expect(exportButton).toBeEnabled();
  await expect.poll(() => downloads.length).toBe(1);
  expect(exportRequests).toBe(1);
});
