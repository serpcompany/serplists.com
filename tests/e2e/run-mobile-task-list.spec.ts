import { expect, test, type Page } from '@playwright/test';

// Below xl (1280px) the run page hides its task column, so the progress block opens the
// same task list in a sheet (src/components/run-execution/MobileRunProgress.tsx).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

async function createRun(page: Page) {
  return page.evaluate(async ({ apiBaseUrl }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: `Mobile task list QA ${Date.now()}`,
        sections: [
          { id: 'mob-1', title: 'Prepare', items: [
            { id: 'mob-a', title: 'Task A' },
            { id: 'mob-b', title: 'Task B' },
            { id: 'mob-c', title: 'Task C' },
          ] },
          { id: 'mob-2', title: 'Ship', items: [
            { id: 'mob-d', title: 'Task D' },
            { id: 'mob-e', title: 'Task E' },
          ] },
        ],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return ((await response.json()) as { id: string }).id;
  }, { apiBaseUrl: DEV_API_BASE_URL });
}

async function deleteRun(page: Page, runId: string) {
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1024, height: 768 }]) {
  test(`at ${viewport.width}px any task can be opened from the Tasks list`, async ({ page }) => {
    await loginAsAdmin(page);
    const runId = await createRun(page);
    await page.setViewportSize(viewport);

    await page.goto(`/dashboard/runs/${runId}`);
    await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
    await expect(page.locator('[data-run-progress-panel]')).toBeHidden();

    await page.getByRole('button', { name: 'Mark Complete' }).click();
    await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();

    const tasks = page.getByRole('button', { name: 'Tasks', exact: true });
    await tasks.click();
    const sheet = page.getByRole('dialog', { name: 'Tasks' });
    await expect(sheet.getByRole('button', { name: /Task B/ })).toHaveAttribute('aria-current', 'step');
    await expect(sheet.getByRole('button', { name: /Task A/ })).toContainText('(completed)');
    await sheet.getByRole('button', { name: /Task D/ }).click();

    await expect(sheet).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Task D' })).toBeVisible();
    await expect(page.getByText('Task 4 of 5')).toBeVisible();

    await deleteRun(page, runId);
  });
}

test('at desktop width the task column shows and the Tasks button does not', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/dashboard/runs/${runId}`);
  await expect(page.locator('[data-run-progress-panel]')).toBeVisible();
  await expect(page.locator('[data-mobile-run-tasks-trigger]')).toBeHidden();
  await page.locator('[data-run-progress-panel]').getByRole('button', { name: /Task E/ }).click();
  await expect(page.getByRole('heading', { name: 'Task E' })).toBeVisible();

  await deleteRun(page, runId);
});
