import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// Share, archive and restore create no template version, only an audit event; the
// Changelog must still show them (src/features/template-detail/templateHistoryTimeline.ts).

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function callApi(page: Page, method: string, path: string, body?: unknown) {
  return apiJson<Record<string, unknown>>(page, path, { method, body });
}

test('the Changelog shows Share, archive and restore next to versions', async ({ page }) => {
  await loginAsAdmin(page);
  const stamp = Date.now();
  const created = await callApi(page, 'POST', '/templates', {
    title: `Changelog ${stamp}`,
    slug: `changelog-${stamp}`,
    is_public: false,
    sections: [{ id: 'log-section', title: 'Section', items: [{ id: 'log-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);

  try {
    await page.goto(`/dashboard/templates/${templateId}`);
    await expect(page.getByText('Created template v1')).toBeVisible();

    await page.getByRole('button', { name: 'Share' }).click();
    await page.getByRole('button', { name: 'Close' }).first().click();
    // No reload: the Changelog refreshes after Share.
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
