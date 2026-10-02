import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { apiJsonAt as api, bodyNotRead } from './support/api-requests';
import { apiTemplateSchema, savedTemplateSchema, templateVersion } from './support/api-bodies';
import { loginAsAdmin } from './support/sign-in';

async function sendTheShareRequestFromAnotherTab(context: BrowserContext, templateId: string, version: number) {
  const sharer = await context.newPage();
  await sharer.goto('/dashboard/templates/');
  await api(sharer, `/templates/${templateId}`, 'PUT', bodyNotRead, { is_public: true, expected_version: version });
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
  const created = await api(editor, '/templates', 'POST', savedTemplateSchema, {
    title,
    sections: [{ id: `stale-${Date.now()}`, title: 'Checklist', items: [{ id: `stale-task-${Date.now()}`, title: 'Check DNS' }] }],
    is_public: false,
  });
  const loaded = await api(editor, `/templates/${created.id}`, 'GET', templateVersion);

  await editor.goto(`/dashboard/templates/${created.id}/edit/`);
  await expect(editor.getByPlaceholder('Enter template name...')).toHaveValue(title);

  await sendTheShareRequestFromAnotherTab(context, created.id, loaded.version);

  await returnToTheEditorTab(editor);
  await editor.getByPlaceholder('Enter template name...').fill(`${title} (typo fixed)`);
  await editor.getByRole('button', { name: 'Save' }).click();

  await expect(editor.getByText('Template changed since it was loaded. Refresh before saving again.').first()).toBeVisible();
  const stored = await api(editor, `/templates/${created.id}`, 'GET', apiTemplateSchema);
  expect(Boolean(stored.is_public)).toBe(true);
  expect(stored.title).toBe(title);

  await api(editor, `/templates/${created.id}`, 'DELETE', bodyNotRead);
});
