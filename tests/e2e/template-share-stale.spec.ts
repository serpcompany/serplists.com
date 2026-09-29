import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';

// Share on a template detail page left open must not hand out a dead public link when the
// template was made private or given a new slug elsewhere (another tab, device, or an
// Organization teammate). The page still shows it as public, so Share has to ask the server.

const CONFLICT_MESSAGE = 'This template changed elsewhere. It was reloaded; try again.';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function callApi(page: Page, method: string, path: string, body?: unknown) {
  return apiJson<Record<string, unknown>>(page, path, { method, body });
}

async function createPublicTemplate(page: Page, label: string) {
  const stamp = Date.now();
  const created = await callApi(page, 'POST', '/templates', {
    title: `Share stale ${label} ${stamp}`,
    is_public: true,
    sections: [{ id: `share-stale-section-${stamp}`, title: 'Section', items: [{ id: `share-stale-item-${stamp}`, title: 'Task' }] }],
  });
  return String(created.id);
}

async function openPublicDetail(page: Page, templateId: string) {
  await page.goto(`/dashboard/templates/${templateId}`);
  await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  return callApi(page, 'GET', `/templates/${templateId}`);
}

test('Share gives no link after the template was made private elsewhere', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createPublicTemplate(page, 'private');

  try {
    const loaded = await openPublicDetail(page, templateId);
    await callApi(page, 'PUT', `/templates/${templateId}`, {
      is_public: false,
      expected_version: loaded.version,
    });

    // The page still shows Public; Share must not offer the old link.
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByText(CONFLICT_MESSAGE)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Share Template' })).toHaveCount(0);
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    const stored = await callApi(page, 'GET', `/templates/${templateId}`);
    expect(Boolean(stored.is_public)).toBe(false);

    // After the reload, Share publishes again and the link opens.
    await page.getByRole('button', { name: 'Share' }).click();
    const dialog = page.getByRole('dialog', { name: 'Share Template' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    const republished = await callApi(page, 'GET', `/templates/${templateId}`);
    expect(Boolean(republished.is_public)).toBe(true);
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});

test('Share builds the link from the slug set elsewhere', async ({ page }) => {
  await loginAsAdmin(page);
  const templateId = await createPublicTemplate(page, 'slug');
  const newSlug = `share-stale-renamed-${Date.now()}`;

  try {
    const loaded = await openPublicDetail(page, templateId);
    const oldSlug = String(loaded.slug);
    await callApi(page, 'PUT', `/templates/${templateId}`, {
      slug: newSlug,
      expected_version: loaded.version,
    });

    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByText(CONFLICT_MESSAGE)).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Share Template' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Share' }).click();
    const dialog = page.getByRole('dialog', { name: 'Share Template' });
    await expect(dialog).toBeVisible();
    const link = dialog.getByRole('textbox', { name: 'Share link' });
    await expect(link).toHaveValue(new RegExp(`/profile/[^/]+/${newSlug}$`));
    await expect(link).not.toHaveValue(new RegExp(`/${oldSlug}$`));
  } finally {
    await callApi(page, 'DELETE', `/templates/${templateId}`);
  }
});
