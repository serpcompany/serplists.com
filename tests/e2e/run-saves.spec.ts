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
