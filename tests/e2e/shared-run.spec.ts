import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, apiJson, apiRequest } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';

type StoredRun = {
  progress: number;
  items: string | Array<{ items: Array<{ title: string; isCompleted?: boolean }> }>;
};

async function readOwnerRun(page: Page, runId: string) {
  const run = await apiJson<StoredRun>(page, `/checklists/${runId}`);
  const sections = (typeof run.items === 'string' ? JSON.parse(run.items) : run.items) as Array<{
    items: Array<{ title: string; isCompleted?: boolean }>;
  }>;
  return {
    progress: run.progress,
    tasks: sections.flatMap((section) => section.items.map((item) => `${item.title}:${item.isCompleted === true}`)),
  };
}

async function createSharedRun(page: Page, run: { title: string; sections: unknown[] }) {
  const { id: runId } = await apiJson<{ id: string }>(page, '/checklists', { method: 'POST', body: run });
  const { shareToken } = await apiJson<{ shareToken: string }>(page, `/checklists/run/${runId}/share`, {
    method: 'POST',
    body: {},
  });
  return { runId, shareToken };
}

async function deleteRun(page: Page, runId: string) {
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
}

test('a share-link guest can tick tasks but cannot rewrite or wipe the run', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);

  const { runId, shareToken } = await createSharedRun(page, {
    title: `Shared run guard ${Date.now()}`,
    sections: [{ id: 'guard', title: 'Section', items: [
      { id: 'guard-a', title: 'Task A' },
      { id: 'guard-b', title: 'Task B' },
    ] }],
  });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const sharedUrl = `${API_BASE_URL}/checklists/shared/${shareToken}`;
  const guestRevision = async () =>
    ((await (await guest.request.get(sharedUrl)).json()) as { revision: number }).revision;

  await guest.goto(`/share/${shareToken}/`);
  await expect(guest.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await guest.getByRole('checkbox', { name: 'Mark "Task A" complete' }).click();
  await expect.poll(() => readOwnerRun(page, runId)).toEqual({ progress: 50, tasks: ['Task A:true', 'Task B:false'] });

  const wipe = await guest.request.put(sharedUrl, {
    data: { sections: [], progress: 100, status: 'in_progress', expected_revision: await guestRevision() },
  });
  expect(wipe.status()).toBe(200);

  const rewrite = await guest.request.put(sharedUrl, {
    data: {
      title: 'Renamed by guest',
      expected_revision: await guestRevision(),
      sections: [{ id: 'guard', title: 'Hacked', items: [
        { id: 'guard-a', title: 'Log in here', description: 'https://attacker.example', isCompleted: true },
        { id: 'guard-z', title: 'Injected', isCompleted: true },
      ] }],
    },
  });
  expect(rewrite.status()).toBe(200);

  const noRevision = await guest.request.put(sharedUrl, { data: { sections: [] } });
  expect(noRevision.status()).toBe(400);

  expect(await readOwnerRun(page, runId)).toEqual({ progress: 50, tasks: ['Task A:true', 'Task B:false'] });

  await guestContext.close();
  await deleteRun(page, runId);
});

test('a share-link guest is told what they may do, completes the Run and stays on it, which then reads Completed', async ({ browser, page }) => {
  await loginAsAdmin(page);
  const { runId, shareToken } = await createSharedRun(page, {
    title: `Shared completion ${Date.now()}`,
    sections: [{ id: 'done', title: 'Section', items: [
      { id: 'done-a', title: 'Task A' },
      { id: 'done-b', title: 'Task B' },
    ] }],
  });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`/share/${shareToken}/`);
  await expect(guest.getByText('Anyone with this link can tick tasks, add notes and complete this Run.')).toBeVisible();
  await expect(guest.getByText(/read-only/i)).toHaveCount(0);
  await guest.getByRole('checkbox', { name: 'Mark "Task A" complete' }).click();
  await guest.getByRole('checkbox', { name: 'Mark "Task B" complete' }).click();

  const dialog = guest.getByRole('dialog', { name: 'Complete this Run?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Complete Run' }).click();

  await expect(guest.getByText('Run completed', { exact: true }).first()).toBeVisible();
  await expect(guest).toHaveURL(new RegExp(`/share/${shareToken}/$`));
  await expect(guest.getByText('Completed', { exact: true })).toBeVisible();
  await expect(guest.getByRole('checkbox', { name: 'Mark "Task A" complete' })).toBeDisabled();
  await expect.poll(async () => (await apiJson<{ status: string }>(page, `/checklists/${runId}`)).status).toBe('completed');

  await guestContext.close();
  await deleteRun(page, runId);
});

test('stopping a share from the runs list turns the guest link off', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);

  const title = `Stop sharing ${Date.now()}`;
  const { runId, shareToken } = await createSharedRun(page, {
    title,
    sections: [{ id: 'stop', title: 'Section', items: [{ id: 'stop-a', title: 'Task A' }] }],
  });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const sharedUrl = `${API_BASE_URL}/checklists/shared/${shareToken}`;
  expect((await guest.request.get(sharedUrl)).status()).toBe(200);

  await page.goto('/dashboard/runs/');
  const row = page.locator('div.group', { hasText: title });
  await expect(row.getByText('Shared', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Run options' }).click();
  await page.getByRole('menuitem', { name: 'Stop sharing' }).click();
  await expect(page.getByText('Sharing stopped. The old link no longer works.')).toBeVisible();
  await expect(row.getByText('Shared', { exact: true })).toHaveCount(0);

  expect((await guest.request.get(sharedUrl)).status()).toBe(404);
  const guestSave = await guest.request.put(sharedUrl, { data: { status: 'completed', expected_revision: 1 } });
  expect(guestSave.status()).toBe(404);

  await guestContext.close();
  await deleteRun(page, runId);
});

test('stopping a share from the run page turns the guest link off, and the page keeps saving', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);

  const { runId, shareToken } = await createSharedRun(page, {
    title: `Run page stop sharing ${Date.now()}`,
    sections: [{ id: 'page', title: 'Section', items: [{ id: 'page-a', title: 'Task A' }] }],
  });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const sharedUrl = `${API_BASE_URL}/checklists/shared/${shareToken}`;
  expect((await guest.request.get(sharedUrl)).status()).toBe(200);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByText('Shared', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByText('Sharing stopped. The old link no longer works.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop sharing' })).toHaveCount(0);
  expect((await guest.request.get(sharedUrl)).status()).toBe(404);

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect.poll(async () => (await readOwnerRun(page, runId)).tasks).toEqual(['Task A:true']);

  await guestContext.close();
  await deleteRun(page, runId);
});
