import { expect, test, type Page } from '@playwright/test';

import { API_BASE_URL, apiJson, apiRequest, trackApiRequests } from './support/api-requests';
import { fillSignInForm } from './support/sign-in';

// A share link is a completion-only credential: a guest can tick tasks and write notes,
// but a crafted PUT can never rewrite, inject into, or wipe the owner's run
// (functions/api/utils/shared-run-merge.ts).

async function loginAsAdmin(page: Page) {
  const apiRequests = trackApiRequests(page, API_BASE_URL);
  await page.goto('/login');
  await fillSignInForm(page, 'admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
  // Signing in lands on Account Settings: let its requests finish before the test calls
  // the API, which the local dev proxy can drop in a burst (see support/api-requests.ts).
  await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible();
  await apiRequests.settled();
}

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

// Creates a run as the signed-in owner and shares it.
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

  await guest.goto(`/share/${shareToken}`);
  await expect(guest.getByRole('heading', { name: 'Task A' })).toBeVisible();
  // The shared view lists every task with its own checkbox (no step-by-step Mark Complete).
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

  await page.goto('/dashboard/runs');
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

test('stopping a share from the run page turns the guest link off', async ({ browser, page }) => {
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

  await page.goto(`/dashboard/runs/${runId}`);
  await expect(page.getByText('Shared', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop sharing' }).click();
  await expect(page.getByText('Sharing stopped. The old link no longer works.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop sharing' })).toHaveCount(0);
  expect((await guest.request.get(sharedUrl)).status()).toBe(404);

  // The run page keeps saving after stopping sharing (no revision change).
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect.poll(async () => (await readOwnerRun(page, runId)).tasks).toEqual(['Task A:true']);

  await guestContext.close();
  await deleteRun(page, runId);
});
