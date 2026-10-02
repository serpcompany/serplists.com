import { expect, test } from '@playwright/test';

import { apiJsonAt, apiRecord as callApi } from './support/api-requests';
import { savedTemplateSchema } from './support/api-bodies';
import { loginAsAdmin } from './support/sign-in';

test('the Changelog shows Share without a reload, and archive and restore next to versions', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const created = await apiJsonAt(page, '/templates', 'POST', savedTemplateSchema, {
    title: `Changelog ${stamp}`,
    slug: `changelog-${stamp}`,
    is_public: false,
    sections: [{ id: 'log-section', title: 'Section', items: [{ id: 'log-item', title: 'Task' }] }],
  });
  const templateId = created.id;

  try {
    await page.goto(`/dashboard/templates/${templateId}/`);
    await expect(page.getByText('Created template v1')).toBeVisible();

    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByText('Made template public')).toBeVisible();

    await callApi(page, 'DELETE', `/templates/${templateId}`);
    await callApi(page, 'POST', `/templates/${templateId}/restore`, {});
    await page.reload();

    await expect(page.getByText('Restored template')).toBeVisible();
    await expect(page.getByText('Deleted template')).toBeVisible();
    await expect(page.getByText('Made template public')).toBeVisible();
    await expect(page.getByText('Created template v1')).toBeVisible();
    await expect(page.getByText(/^Created template/)).toHaveCount(1);
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
