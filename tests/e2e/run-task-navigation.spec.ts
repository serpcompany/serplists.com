import { expect, test, type Page } from '@playwright/test';

// The run page shows one task at a time and the window scrolls. Moving to another task
// (Mark Complete, Next, Previous) scrolls its header back into view below the sticky
// headers and focuses its title (src/components/run-execution/TaskHeaderReveal.tsx).

const DEV_API_BASE_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8788/api';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Fill Admin' }).click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible({ timeout: 30_000 });
}

// Several viewports of text, so the task buttons are only reached by scrolling.
const longText = Array.from({ length: 60 }, (_, index) => `Paragraph ${index + 1} of the task instructions.`).join('\n\n');

async function createRun(page: Page) {
  return page.evaluate(async ({ apiBaseUrl, text }) => {
    const response = await fetch(`${apiBaseUrl}/checklists`, {
      body: JSON.stringify({
        title: `Task navigation QA ${Date.now()}`,
        sections: [{ id: 'nav', title: 'Section', items: [
          { id: 'nav-a', title: 'Task A', contents: [{ type: 'text', value: text }] },
          { id: 'nav-b', title: 'Task B', contents: [
            { type: 'text', value: text },
            { type: 'subItems', value: '', subItems: [{ id: 'nav-b-1', title: 'Check B one' }] },
          ] },
          { id: 'nav-c', title: 'Task C', contents: [{ type: 'text', value: text }] },
        ] }],
      }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return ((await response.json()) as { id: string }).id;
  }, { apiBaseUrl: DEV_API_BASE_URL, text: longText });
}

async function deleteRun(page: Page, runId: string) {
  await page.evaluate(async ({ id, apiBaseUrl }) => {
    await fetch(`${apiBaseUrl}/checklists/${id}`, { credentials: 'include', method: 'DELETE' });
  }, { id: runId, apiBaseUrl: DEV_API_BASE_URL });
}

// The sticky site header, plus the context header below md (768px).
const stickyHeight = (width: number) => (width < 768 ? 112 : 56);

async function expectRevealed(page: Page, title: string, width: number) {
  const heading = page.getByRole('heading', { level: 2, name: title });
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
  const box = await heading.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(stickyHeight(width));
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`at ${viewport.width}px moving to another task shows its title`, async ({ page }) => {
    await loginAsAdmin(page);
    const runId = await createRun(page);
    await page.setViewportSize(viewport);

    await page.goto(`/dashboard/runs/${runId}`);
    const taskA = page.getByRole('heading', { level: 2, name: 'Task A' });
    await expect(taskA).toBeVisible();
    // Opening a run neither scrolls nor takes focus.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(taskA).not.toBeFocused();

    const markComplete = page.getByRole('button', { name: 'Mark Complete' });
    await markComplete.scrollIntoViewIfNeeded();
    await expect(taskA).not.toBeInViewport();
    await markComplete.click();
    await expectRevealed(page, 'Task B', viewport.width);

    // Ticking a sub-task keeps the task, so the page stays where it is.
    const subTask = page.getByRole('checkbox', { name: 'Check B one' });
    await subTask.scrollIntoViewIfNeeded();
    const scrollBeforeTick = await page.evaluate(() => window.scrollY);
    const saved = page.waitForResponse((response) =>
      response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT');
    await subTask.click();
    await saved;
    await expect(subTask).toBeChecked();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeTick);

    const next = page.getByRole('button', { name: 'Next', exact: true });
    await next.scrollIntoViewIfNeeded();
    await next.click();
    await expectRevealed(page, 'Task C', viewport.width);

    const previous = page.getByRole('button', { name: 'Previous' });
    await previous.scrollIntoViewIfNeeded();
    await previous.click();
    await expectRevealed(page, 'Task B', viewport.width);

    await deleteRun(page, runId);
  });
}

test('the desktop task list opens a task at its title', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page);
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/dashboard/runs/${runId}`);
  await expect(page.getByRole('heading', { level: 2, name: 'Task A' })).toBeVisible();
  // Scroll the task header 30px under the sticky site header, leaving the task list in view.
  const shell = await page.locator('[data-run-workspace-shell]').boundingBox();
  await page.evaluate((by) => window.scrollBy(0, by), (shell?.y ?? 0) - stickyHeight(1440) + 30);

  await page.locator('[data-run-progress-panel]').getByRole('button', { name: /Task C/ }).click();
  await expectRevealed(page, 'Task C', 1440);

  await deleteRun(page, runId);
});
