import { expect, test, type Page } from '@playwright/test';

// Creating a run share link and copying it are separate steps: the link is always shown
// in a dialog, and a refused clipboard write (Safari after an awaited request, denied
// permission) is not reported as a failed share (src/lib/shareLink.ts).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';
const SHARE_URL = /\/share\/[0-9a-f-]{36}$/;

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
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

async function createRun(page: Page, title: string) {
  return page.evaluate(async ({ apiBaseUrl, runTitle }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: runTitle,
        sections: [{ id: 'share', title: 'Section', items: [{ id: 'share-a', title: 'Task A' }] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return ((await response.json()) as { id: string }).id;
  }, { apiBaseUrl: DEV_API_BASE_URL, runTitle: title });
}

async function deleteRun(page: Page, runId: string) {
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
}

test('the run page shows the share link when the clipboard refuses the copy', async ({ page, context }) => {
  await refuseClipboardWrites(page);
  await loginAsAdmin(page);
  const runId = await createRun(page, `Share QA ${Date.now()}`);
  const shareRequests: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/checklists/run/${runId}/share`)) shareRequests.push(response.status());
  });

  await page.goto(`/dashboard/runs/${runId}`);
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share run' });
  await expect(dialog).toBeVisible();
  const link = dialog.getByRole('textbox', { name: 'Share link' });
  await expect(link).toHaveValue(SHARE_URL);
  await expect(page.getByText(/Failed to create share link|not allowed/)).toHaveCount(0);

  // Reopening shows the same link instead of replacing the token.
  const shareUrl = await link.inputValue();
  await dialog.getByRole('button', { name: 'Close' }).click();
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

  await page.goto('/dashboard/runs');
  const row = page.locator('[data-run-actions="true"]').filter({ has: page.locator(`a[href="/run/${runId}"]`) });
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
  const { runId, templateId } = await page.evaluate(async ({ apiBaseUrl, runTitle }) => {
    const send = async (path: string, method: string, body: unknown) =>
      (await fetch(`${apiBaseUrl}${path}`, {
        body: JSON.stringify(body),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method,
      })).json() as Promise<{ id: string }>;
    const sections = (done: boolean, ids: string[]) =>
      [{ id: 'stale', title: 'Section', items: ids.map((id) => ({ id, title: id, isCompleted: done })) }];

    const template = await send('/templates', 'POST', { title: runTitle, sections: sections(false, ['stale-a']), is_public: false });
    const run = await send('/checklists', 'POST', { template_id: template.id, title: runTitle, status: 'in_progress' });
    // A completed run is frozen when its Template changes, so it goes stale.
    await send(`/checklists/${run.id}`, 'PUT', { expected_revision: 1, progress: 100, sections: sections(true, ['stale-a']), status: 'completed' });
    await send(`/templates/${template.id}`, 'PUT', { title: runTitle, sections: sections(false, ['stale-a', 'stale-b']), expected_version: 1 });
    return { runId: run.id, templateId: template.id };
  }, { apiBaseUrl: DEV_API_BASE_URL, runTitle: title });

  await page.goto('/dashboard/runs');
  const actions = page.locator('[data-run-actions="true"]').filter({ has: page.locator(`a[href="/run/${runId}"]`) });
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
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/templates/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: templateId, apiBaseUrl: DEV_API_BASE_URL });
});
