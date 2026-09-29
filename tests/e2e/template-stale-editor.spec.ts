import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// An editor loaded before a Share in another tab must not make the template private again
// when it saves: the save is guarded by the version the editor loaded, even after the
// template list refetches on focus.

async function loginAsAdmin(page: Page) {
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function api<T>(page: Page, path: string, method: string, body?: unknown): Promise<T> {
  return apiJson<T>(page, path, { method, body });
}

test('an editor opened before a Share cannot make the template private again', async ({ context }) => {
  const editor = await context.newPage();
  await loginAsAdmin(editor);
  const title = `Stale editor QA ${Date.now()}`;
  const created = await api<{ id: string }>(editor, '/templates', 'POST', {
    title,
    sections: [{ id: `stale-${Date.now()}`, title: 'Checklist', items: [{ id: `stale-task-${Date.now()}`, title: 'Check DNS' }] }],
    is_public: false,
  });
  const loaded = await api<{ version: number }>(editor, `/templates/${created.id}`, 'GET');

  await editor.goto(`/dashboard/templates/${created.id}/edit/`);
  await expect(editor.getByPlaceholder('Enter template name...')).toHaveValue(title);

  // Another tab shares the template (the Share button's request).
  const sharer = await context.newPage();
  await sharer.goto('/dashboard/templates/');
  await api(sharer, `/templates/${created.id}`, 'PUT', { is_public: true, expected_version: loaded.version });
  await sharer.close();

  // Back in the editor tab, the template list refetches on focus before the save.
  await editor.bringToFront();
  await editor.evaluate(() => window.dispatchEvent(new Event('focus')));
  await editor.getByPlaceholder('Enter template name...').fill(`${title} (typo fixed)`);
  await editor.getByRole('button', { name: 'Save' }).click();

  await expect(editor.getByText('Template changed since it was loaded. Refresh before saving again.').first()).toBeVisible();
  const stored = await api<{ is_public: unknown; title: string }>(editor, `/templates/${created.id}`, 'GET');
  expect(Boolean(stored.is_public)).toBe(true);
  expect(stored.title).toBe(title);

  await api(editor, `/templates/${created.id}`, 'DELETE');
});
