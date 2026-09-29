import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, apiJson, apiRequest, trackApiRequests } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// Creating a run share link and copying it are separate steps: the link is always shown
// in a dialog, and a refused clipboard write (Safari after an awaited request, denied
// permission) is not reported as a failed share (src/lib/shareLink.ts).

const SHARE_URL = /\/share\/[0-9a-f-]{36}\/$/;

async function loginAsAdmin(page: Page) {
  const apiRequests = trackApiRequests(page, API_BASE_URL);
  await page.goto('/login/');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  // Signing in lands on Account Settings: let its requests finish before the test calls
  // the API, which the local dev proxy can drop in a burst (see support/api-requests.ts).
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
  await apiRequests.settled();
}

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

async function deleteRun(page: Page, runId: string) {
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
}

test('the run page shows the share link when the clipboard refuses the copy', async ({ page, context }) => {
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

  // Reopening shows the same link instead of replacing the token.
  const shareUrl = await link.inputValue();
  // The footer Close button; the dialog's corner X is also named Close.
  await dialog.getByRole('button', { name: 'Close' }).first().click();
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

// Sharing makes a run public, and the API refuses to revalidate a public run. The runs
// list is cached for 5 minutes, so it must drop Revalidate as soon as the share exists.
test('sharing a stale run from the runs list stops offering Revalidate', async ({ page }) => {
  await refuseClipboardWrites(page);
  await loginAsAdmin(page);
  const title = `Stale share QA ${Date.now()}`;
  const sections = (done: boolean, ids: string[]) =>
    [{ id: 'stale', title: 'Section', items: ids.map((id) => ({ id, title: id, isCompleted: done })) }];
  const template = await send(page, '/templates', 'POST', { title, sections: sections(false, ['stale-a']), is_public: false });
  const run = await send(page, '/checklists', 'POST', { template_id: template.id, title, status: 'in_progress' });
  // A completed run is frozen when its Template changes, so it goes stale.
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
  const { id: runId } = run;
  const { id: templateId } = template;

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

// Sharing marks the run public in the cached runs list. That must not reload the open run
// page, which would clear unsaved task notes and move the selection back to the first task.
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

  // Opened from the runs list, so the list is cached when the share marks the run public.
  await page.goto('/dashboard/runs/');
  await page.getByRole('link', { name: title }).click();
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Checked the redirects');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();

  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share run' });
  await expect(dialog.getByRole('textbox', { name: 'Share link' })).toHaveValue(SHARE_URL);
  await dialog.getByRole('button', { name: 'Close' }).first().click();

  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(notes).toHaveValue('Checked the redirects');
  expect(runLoads).toHaveLength(1);

  await deleteRun(page, runId);
});
