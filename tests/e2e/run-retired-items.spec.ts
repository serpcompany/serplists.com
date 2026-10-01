import { expect, test, type Page } from '@playwright/test';

import { apiJsonAt as api } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';

async function replaceTemplateSectionsAtItsVersion(page: Page, templateId: string, sections: unknown[]) {
  const { version } = await api<{ version: number }>(page, `/templates/${templateId}`, 'GET');
  await api(page, `/templates/${templateId}`, 'PUT', { sections, expected_version: version });
}

test('notes on a task removed from the Template stay visible on the Run', async ({ page }) => {
  await loginAsAdmin(page);
  const suffix = Date.now();
  const sections = [{
    id: `retired-${suffix}`,
    title: 'Launch',
    items: [
      { id: `retired-dns-${suffix}`, title: 'Check DNS' },
      { id: `retired-copy-${suffix}`, title: 'Write copy' },
    ],
  }];
  const template = await api<{ id: string }>(page, '/templates', 'POST', {
    title: `Retired work QA ${suffix}`,
    sections,
    is_public: false,
  });
  const run = await api<{ id: string }>(page, '/checklists', 'POST', { template_id: template.id, title: `Retired run ${suffix}` });

  await page.goto(`/dashboard/runs/${run.id}/`);
  await expect(page.getByRole('heading', { name: 'Check DNS' })).toBeVisible();
  await page.getByLabel('Task notes').fill('Registrar login is in vault X; TTL lowered to 300');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Write copy' })).toBeVisible();

  await replaceTemplateSectionsAtItsVersion(page, template.id, [{ ...sections[0], items: [sections[0].items[1]] }]);

  await page.reload();
  const headerTaskCount = page.getByText('0 of 1 task finished').first();
  await expect(headerTaskCount).toBeVisible();
  const retired = page.locator('[data-retired-run-items="true"]');
  await retired.getByText('Removed from Template (1)').click();
  await expect(retired.getByText('Check DNS')).toBeVisible();
  await expect(retired.getByText('Registrar login is in vault X; TTL lowered to 300')).toBeVisible();
  await expect(retired.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Updated from Template')).toBeVisible();

  await api(page, `/checklists/${run.id}`, 'DELETE');
  await api(page, `/templates/${template.id}`, 'DELETE');
});
