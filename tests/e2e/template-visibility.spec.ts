import { expect, test } from '@playwright/test';

import { apiRecord as callApi } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';

test('shows Public after Share follows a switch to Private, and accepts the next change', async ({ page }) => {
  await loginAsAdmin(page);
  const created = await callApi(page, 'POST', '/templates', {
    title: `Visibility QA ${Date.now()}`,
    is_public: true,
    sections: [{ id: 'visibility-section', title: 'Section', items: [{ id: 'visibility-item', title: 'Task' }] }],
  });
  const templateId = String(created.id);

  try {
    await page.goto(`/dashboard/templates/${templateId}/`);
    const visibilitySwitch = page.getByRole('switch');
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'true');

    await visibilitySwitch.click();
    await expect(page.getByText('Template is now private')).toBeVisible();
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false');

    await page.getByRole('button', { name: 'Share' }).click();
    const dialog = page.getByRole('dialog', { name: 'Share Template' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).first().click();

    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Public', { exact: true }).first()).toBeVisible();

    await visibilitySwitch.click();
    await expect(page.getByText('Template is now private')).toBeVisible();
    await expect(visibilitySwitch).toHaveAttribute('aria-checked', 'false');
    const saved = await callApi(page, 'GET', `/templates/${templateId}`);
    expect(Boolean(saved.is_public)).toBe(false);
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
