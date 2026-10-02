import { expect, test, type Page } from '@playwright/test';

import { apiJson } from './support/api-requests';
import { createdRunSchema } from './support/api-bodies';
import { loginAsAdmin } from './support/sign-in';
import { deleteRun, openTheRunAtDesktopWidth } from './support/run-saves';

const CONSOLE_TOP_BAR_HEIGHT = 56;
const TASK_HEADER_TUCKED_UNDER_TOP_BAR_PX = 30;

const textSeveralScreensLong = Array.from({ length: 60 }, (_, index) => `Paragraph ${index + 1} of the task instructions.`).join('\n\n');

async function createRun(page: Page) {
  const run = await apiJson(page, '/checklists', createdRunSchema, {
    method: 'POST',
    body: {
      title: `Task navigation QA ${Date.now()}`,
      sections: [{ id: 'nav', title: 'Section', items: [
        { id: 'nav-a', title: 'Task A', contents: [{ type: 'text', value: textSeveralScreensLong }] },
        { id: 'nav-b', title: 'Task B', contents: [
          { type: 'text', value: textSeveralScreensLong },
          { type: 'subItems', value: '', subItems: [{ id: 'nav-b-1', title: 'Check B one' }] },
        ] },
        { id: 'nav-c', title: 'Task C', contents: [{ type: 'text', value: textSeveralScreensLong }] },
      ] }],
    },
  });
  return run.id;
}

async function readToTheEndOfTheTask(page: Page, title: string) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(page.getByRole('heading', { level: 2, name: title })).not.toBeInViewport();
}

async function expectRevealed(page: Page, title: string) {
  const heading = page.getByRole('heading', { level: 2, name: title });
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
  const box = await heading.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThanOrEqual(CONSOLE_TOP_BAR_HEIGHT);
}

async function tuckTheTaskHeaderUnderTheTopBar(page: Page) {
  const shell = await page.locator('[data-run-workspace-shell]').boundingBox();
  await page.evaluate(
    (by) => window.scrollBy(0, by),
    (shell?.y ?? 0) - CONSOLE_TOP_BAR_HEIGHT + TASK_HEADER_TUCKED_UNDER_TOP_BAR_PX,
  );
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`at ${viewport.width}px moving to another task shows its title`, async ({ page }) => {
    await loginAsAdmin(page);
    const runId = await createRun(page);
    await page.setViewportSize(viewport);

    await page.goto(`/dashboard/runs/${runId}/`);
    const taskA = page.getByRole('heading', { level: 2, name: 'Task A' });
    await expect(taskA).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(taskA).not.toBeFocused();

    await readToTheEndOfTheTask(page, 'Task A');
    await page.getByRole('button', { name: 'Mark Complete' }).click();
    await expectRevealed(page, 'Task B');

    const subTask = page.getByRole('checkbox', { name: 'Check B one' });
    await subTask.scrollIntoViewIfNeeded();
    const scrollBeforeTick = await page.evaluate(() => window.scrollY);
    const saved = page.waitForResponse((response) =>
      response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT');
    await subTask.click();
    await saved;
    await expect(subTask).toBeChecked();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeTick);

    await readToTheEndOfTheTask(page, 'Task B');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expectRevealed(page, 'Task C');

    await readToTheEndOfTheTask(page, 'Task C');
    await page.getByRole('button', { name: 'Previous' }).click();
    await expectRevealed(page, 'Task B');

    await deleteRun(page, runId);
  });
}

test('the desktop task list opens a task at its title', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page);
  await openTheRunAtDesktopWidth(page, runId);
  await expect(page.getByRole('heading', { level: 2, name: 'Task A' })).toBeVisible();
  await tuckTheTaskHeaderUnderTheTopBar(page);

  await page.locator('[data-run-progress-panel]').getByRole('button', { name: /Task C/ }).click();
  await expectRevealed(page, 'Task C');

  await deleteRun(page, runId);
});
