import { expect, test, type Page } from '@playwright/test';

// A share link is a completion-only credential: a guest can tick tasks and write notes,
// but a crafted PUT can never rewrite, inject into, or wipe the owner's run
// (functions/api/utils/shared-run-merge.ts).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

type StoredRun = {
  progress: number;
  items: string | Array<{ items: Array<{ title: string; isCompleted?: boolean }> }>;
};

async function readOwnerRun(page: Page, runId: string) {
  return page.evaluate(async ({ id, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include' });
    const run = (await response.json()) as StoredRun;
    const sections = (typeof run.items === 'string' ? JSON.parse(run.items) : run.items) as Array<{
      items: Array<{ title: string; isCompleted?: boolean }>;
    }>;
    return {
      progress: run.progress,
      tasks: sections.flatMap((section) => section.items.map((item) => `${item.title}:${item.isCompleted === true}`)),
    };
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
}

test('a share-link guest can tick tasks but cannot rewrite or wipe the run', async ({ browser, page }) => {
  test.setTimeout(120_000);
  await loginAsAdmin(page);

  const { runId, shareToken } = await page.evaluate(async ({ apiBaseUrl }) => {
    const created = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: `Shared run guard ${Date.now()}`,
        sections: [{ id: 'guard', title: 'Section', items: [
          { id: 'guard-a', title: 'Task A' },
          { id: 'guard-b', title: 'Task B' },
        ] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const id = ((await created.json()) as { id: string }).id;
    const shared = await fetch(`${apiBaseUrl}/checklists/run/${id}/share`, {
      body: '{}',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return { runId: id, shareToken: ((await shared.json()) as { shareToken: string }).shareToken };
  }, { apiBaseUrl: DEV_API_BASE_URL });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const sharedUrl = `${DEV_API_BASE_URL}/checklists/shared/${shareToken}`;
  const guestRevision = async () =>
    ((await (await guest.request.get(sharedUrl)).json()) as { revision: number }).revision;

  await guest.goto(`/share/${shareToken}`);
  await expect(guest.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await guest.getByRole('button', { name: 'Mark Complete' }).click();
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
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
});
