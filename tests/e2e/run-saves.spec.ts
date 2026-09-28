import { expect, test, type Page } from '@playwright/test';

// Saves on the run page run one at a time, and a double click counts as one click
// (src/features/run-execution/saveQueue.ts).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function createRun(page: Page, title: string) {
  return page.evaluate(async ({ apiBaseUrl, runTitle }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: runTitle,
        sections: [{ id: 'fin', title: 'Section', items: [
          { id: 'fin-a', title: 'Task A' },
          { id: 'fin-b', title: 'Task B' },
        ] }],
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

async function readRun(page: Page, runId: string) {
  return page.evaluate(async ({ id, apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include' });
    const run = (await response.json()) as { status: string; items: unknown };
    const sections = (typeof run.items === 'string' ? JSON.parse(run.items) : run.items) as Array<{ items: Array<{ isCompleted?: boolean }> }>;
    return { status: run.status, completed: sections.flatMap((section) => section.items.map((item) => item.isCompleted === true)) };
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
}

test('a double click saves once and never reports a conflict', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await page.evaluate(async ({ apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: `Double click QA ${Date.now()}`,
        sections: [{ id: 'dbl', title: 'Section', items: [
          { id: 'dbl-a', title: 'Task A' },
          { id: 'dbl-b', title: 'Task B' },
        ] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return ((await response.json()) as { id: string }).id;
  }, { apiBaseUrl: DEV_API_BASE_URL });

  const saves: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT') {
      saves.push(response.status());
    }
  });
  const conflictToast = page.getByText(/changed (while|since)/);

  await page.goto(`/dashboard/runs/${runId}`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false] });
  expect(saves).toEqual([200]);

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await page.getByRole('button', { name: 'Return to Dashboard' }).dblclick();
  await expect(page).toHaveURL(/\/dashboard\/runs$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });
  expect(saves).toEqual([200, 200, 200]);
  await expect(conflictToast).toHaveCount(0);

  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
});

test('a dismissed completion dialog can be reopened with Finish Run', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Finish run QA ${Date.now()}`);

  await page.goto(`/dashboard/runs/${runId}`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('dialog', { name: 'Checklist Completed!' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Finish Run' }).click();
  await page.getByRole('button', { name: 'Return to Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });

  await deleteRun(page, runId);
});

test('a fully ticked run that is still in progress can be completed after a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Ticked elsewhere QA ${Date.now()}`);
  // Tick every task without completing the run, as an MCP client can.
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, {
      body: JSON.stringify({
        expected_revision: 1,
        progress: 100,
        sections: [{ id: 'fin', title: 'Section', items: [
          { id: 'fin-a', title: 'Task A', isCompleted: true },
          { id: 'fin-b', title: 'Task B', isCompleted: true },
        ] }],
        status: 'in_progress',
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });

  await page.goto(`/dashboard/runs/${runId}`);
  await page.getByRole('button', { name: 'Complete run' }).click();
  await page.getByRole('button', { name: 'Return to Dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });

  await deleteRun(page, runId);
});

test('unsaved task notes are saved with Mark Complete and survive moving between tasks', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Notes draft QA ${Date.now()}`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });

  await page.goto(`/dashboard/runs/${runId}`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Deployed build 42, see link');
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();

  await notes.fill('Draft on B');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(notes).toHaveValue('Deployed build 42, see link');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(notes).toHaveValue('Draft on B');

  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect(notes).toHaveValue('Draft on B');
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(notes).toHaveValue('Deployed build 42, see link');

  await deleteRun(page, runId);
});

test('text typed while a notes save is in flight is kept', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Notes in flight QA ${Date.now()}`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });
  let releaseSave: () => void = () => undefined;
  const saveHeld = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route(`**/api/checklists/${runId}`, async (route) => {
    if (route.request().method() === 'PUT') await saveHeld;
    await route.continue();
  });

  await page.goto(`/dashboard/runs/${runId}`);
  await notes.fill('abc');
  await page.getByRole('button', { name: 'Save notes' }).click();
  await notes.pressSequentially('def');
  releaseSave();
  await expect(page.getByRole('button', { name: 'Save notes' })).toBeEnabled();
  await expect(notes).toHaveValue('abcdef');

  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();
  await page.unroute(`**/api/checklists/${runId}`);
  await page.reload();
  await expect(notes).toHaveValue('abcdef');

  await deleteRun(page, runId);
});

