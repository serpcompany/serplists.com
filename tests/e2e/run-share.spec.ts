import { expect, test, type Locator, type Page } from '@playwright/test';

import { apiJson, apiRequest } from './support/api-requests';
import { openRunFromRunsList } from './support/navigation';
import { loginAsAdmin } from './support/sign-in';
import { deleteRun } from './support/run-saves';

const SHARE_URL = /\/share\/[0-9a-f-]{36}\/$/;

async function refuseClipboardWrites(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new DOMException('The request is not allowed', 'NotAllowedError')),
      },
    });
  });
}

async function send(page: Page, path: string, method: string, body: unknown) {
  return apiJson<{ id: string }>(page, path, { method, body });
}

async function createRun(page: Page, title: string) {
  const run = await send(page, '/checklists', 'POST', {
    title,
    sections: [{ id: 'share', title: 'Section', items: [{ id: 'share-a', title: 'Task A' }] }],
  });
  return run.id;
}

function footerCloseButton(dialog: Locator) {
  return dialog.getByRole('button', { name: 'Close' }).first();
}

async function createStaleCompletedRun(page: Page, title: string) {
  const sections = (done: boolean, ids: string[]) =>
    [{ id: 'stale', title: 'Section', items: ids.map((id) => ({ id, title: id, isCompleted: done })) }];
  const template = await send(page, '/templates', 'POST', { title, sections: sections(false, ['stale-a']), is_public: false });
  const run = await send(page, '/checklists', 'POST', { template_id: template.id, title, status: 'in_progress' });
  await send(page, `/checklists/${run.id}`, 'PUT', {
    expected_revision: 1,
    progress: 100,
    sections: sections(true, ['stale-a']),
    status: 'completed',
  });
  await send(page, `/templates/${template.id}`, 'PUT', {
    title,
    sections: sections(false, ['stale-a', 'stale-b']),
    expected_version: 1,
  });
  return { runId: run.id, templateId: template.id };
}

test('the run page shows the share link when the clipboard refuses the copy, and the same link when reopened', async ({ page, context }) => {
  await refuseClipboardWrites(page);
  await loginAsAdmin(page);
  const runId = await createRun(page, `Share QA ${Date.now()}`);
  const shareRequests: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/checklists/run/${runId}/share`)) shareRequests.push(response.status());
  });

  await page.goto(`/dashboard/runs/${runId}/`);
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share run' });
  await expect(dialog).toBeVisible();
  const link = dialog.getByRole('textbox', { name: 'Share link' });
  await expect(link).toHaveValue(SHARE_URL);
  await expect(page.getByText(/Failed to create share link|not allowed/)).toHaveCount(0);

  const shareUrl = await link.inputValue();
  await footerCloseButton(dialog).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(shareUrl);
  expect(shareRequests).toEqual([200]);

  const guest = await context.browser()!.newPage();
  await guest.goto(shareUrl);
  await expect(guest.getByText('Shared run snapshot').first()).toBeVisible();
  await guest.close();

  await deleteRun(page, runId);
});

test('the runs list shows the share link when the clipboard refuses the copy', async ({ page }) => {
  await refuseClipboardWrites(page);
  await loginAsAdmin(page);
  const title = `List share QA ${Date.now()}`;
  const runId = await createRun(page, title);

  await page.goto('/dashboard/runs/');
  const row = page.locator('[data-run-actions="true"]').filter({ has: page.locator(`a[href="/dashboard/runs/${runId}/"]`) });
  await row.getByRole('button', { name: 'Run options' }).click();
  await page.getByRole('menuitem', { name: 'Share Run' }).click();

  const dialog = page.getByRole('dialog', { name: 'Share run' });
  await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveValue(SHARE_URL);
  await expect(page.getByText('Failed to create share link')).toHaveCount(0);

  await deleteRun(page, runId);
});

test('sharing a stale run from the runs list stops offering Revalidate', async ({ page }) => {
  await refuseClipboardWrites(page);
  await loginAsAdmin(page);
  const { runId, templateId } = await createStaleCompletedRun(page, `Stale share QA ${Date.now()}`);

  await page.goto('/dashboard/runs/');
  const actions = page.locator('[data-run-actions="true"]').filter({ has: page.locator(`a[href="/dashboard/runs/${runId}/"]`) });
  const row = actions.locator('..');
  await expect(row.getByText('Needs revalidation')).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Revalidate' })).toBeVisible();

  await actions.getByRole('button', { name: 'Run options' }).click();
  await page.getByRole('menuitem', { name: 'Share Run' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share run' });
  await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveValue(SHARE_URL);
  await page.keyboard.press('Escape');

  await expect(actions.getByRole('button', { name: 'Revalidate' })).toHaveCount(0);
  await expect(row.getByText('Shared snapshot is out of date')).toBeVisible();

  await deleteRun(page, runId);
  await apiRequest(page, `/templates/${templateId}`, { method: 'DELETE' });
});

test('sharing from the run page keeps unsaved task notes and the open task', async ({ page }) => {
  await refuseClipboardWrites(page);
  await loginAsAdmin(page);
  const title = `Share keeps notes QA ${Date.now()}`;
  const { id: runId } = await send(page, '/checklists', 'POST', {
    title,
    sections: [{ id: 'keep', title: 'Section', items: [
      { id: 'keep-a', title: 'Task A' },
      { id: 'keep-b', title: 'Task B' },
      { id: 'keep-c', title: 'Task C' },
    ] }],
  });
  const runLoads: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith(`/checklists/${runId}`)) {
      runLoads.push(request.url());
    }
  });
  const notes = page.getByRole('textbox', { name: 'Task notes' });

  await openRunFromRunsList(page, title);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Checked the redirects');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();

  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share run' });
  await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveValue(SHARE_URL);
  await footerCloseButton(dialog).click();

  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(notes).toHaveValue('Checked the redirects');
  expect(runLoads).toHaveLength(1);

  await deleteRun(page, runId);
});
