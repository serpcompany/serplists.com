import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { apiJsonAt as api } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';

async function sendTheShareRequestFromAnotherTab(context: BrowserContext, templateId: string, version: number) {
  const sharer = await context.newPage();
  await sharer.goto('/dashboard/templates/');
  await api(sharer, `/templates/${templateId}`, 'PUT', { is_public: true, expected_version: version });
  await sharer.close();
}

async function returnToTheEditorTab(editor: Page) {
  await editor.bringToFront();
  await editor.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('an editor opened before a Share cannot make the template private again, even after its template list refetches on focus', async ({ context }) => {
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

  await sendTheShareRequestFromAnotherTab(context, created.id, loaded.version);

  await returnToTheEditorTab(editor);
  await editor.getByPlaceholder('Enter template name...').fill(`${title} (typo fixed)`);
  await editor.getByRole('button', { name: 'Save' }).click();

  await expect(editor.getByText('Template changed since it was loaded. Refresh before saving again.').first()).toBeVisible();
  const stored = await api<{ is_public: unknown; title: string }>(editor, `/templates/${created.id}`, 'GET');
  expect(Boolean(stored.is_public)).toBe(true);
  expect(stored.title).toBe(title);

  await api(editor, `/templates/${created.id}`, 'DELETE');
});
