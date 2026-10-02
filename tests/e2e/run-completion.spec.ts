import { expect, test, type Page } from '@playwright/test';

import { apiJson, bodyNotRead } from './support/api-requests';
import { loginAsAdmin } from './support/sign-in';
import {
  createRun,
  createRunWithSubTasks,
  deleteRun,
  expectBackOnTheRunsListWithTheRunCompleted,
  openTheRunAt,
  postRun,
  readRun,
  recordSaves,
  stepCheckbox,
} from './support/run-saves';

async function tickEveryTaskWithoutCompleting(page: Page, runId: string) {
  await apiJson(page, `/checklists/${runId}`, bodyNotRead, {
    method: 'PUT',
    body: {
      expected_revision: 1,
      progress: 100,
      sections: [{ id: 'fin', title: 'Section', items: [
        { id: 'fin-a', title: 'Task A', isCompleted: true },
        { id: 'fin-b', title: 'Task B', isCompleted: true },
      ] }],
      status: 'in_progress',
    },
  });
}

test('a double click saves once and never reports a conflict', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await postRun(page, {
    title: `Double click QA ${Date.now()}`,
    sections: [{ id: 'dbl', title: 'Section', items: [
      { id: 'dbl-a', title: 'Task A' },
      { id: 'dbl-b', title: 'Task B' },
    ] }],
  });

  const saves = recordSaves(page, runId);
  const conflictToast = page.getByText(/changed (while|since)/);

  await openTheRunAt(page, runId);
  await page.getByRole('button', { name: 'Mark Complete' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false] });
  expect(saves).toEqual([200]);

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await page.getByRole('button', { name: 'Complete Run' }).dblclick();
  await expectBackOnTheRunsListWithTheRunCompleted(page, runId);
  expect(saves).toEqual([200, 200, 200]);
  await expect(conflictToast).toHaveCount(0);

  await deleteRun(page, runId);
});

test('a dismissed completion dialog can be reopened with Finish Run, and Not yet keeps the run in progress', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Finish run QA ${Date.now()}`);

  await openTheRunAt(page, runId);
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  const dialog = page.getByRole('dialog', { name: 'Complete this Run?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Every task is done. Completing the Run freezes its tasks');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Finish Run' }).click();
  await dialog.getByRole('button', { name: 'Not yet' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await readRun(page, runId)).status).toBe('in_progress');

  await page.getByRole('button', { name: 'Complete run' }).click();
  await dialog.getByRole('button', { name: 'Complete Run' }).click();
  await expect(page.getByText('Run completed', { exact: true }).first()).toBeVisible();
  await expectBackOnTheRunsListWithTheRunCompleted(page, runId);

  await deleteRun(page, runId);
});

test('a fully ticked run that is still in progress can be completed after a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Ticked elsewhere QA ${Date.now()}`);
  await tickEveryTaskWithoutCompleting(page, runId);

  await page.goto(`/dashboard/runs/${runId}/`);
  await page.getByRole('button', { name: 'Complete run' }).click();
  await page.getByRole('button', { name: 'Complete Run' }).click();
  await expectBackOnTheRunsListWithTheRunCompleted(page, runId);

  await deleteRun(page, runId);
});

test('a completed run cannot be unticked, privately or through its share link, and its notes stay editable', async ({ page, browser }) => {
  await loginAsAdmin(page);
  const runId = await createRunWithSubTasks(page, `Frozen run QA ${Date.now()}`, true);
  await apiJson(page, `/checklists/${runId}`, bodyNotRead, {
    method: 'PUT',
    body: {
      completed_at: new Date().toISOString(),
      expected_revision: 1,
      progress: 100,
      sections: [{ id: 'st', title: 'Section', items: [
        { id: 'st-a', title: 'Task A', isCompleted: true, contents: [{ type: 'subItems', value: '', subItems: [
          { id: 'st-a-1', title: 'Step one', isCompleted: true },
          { id: 'st-a-2', title: 'Step two', isCompleted: true },
        ] }] },
        { id: 'st-b', title: 'Task B', isCompleted: true },
      ] }],
      status: 'completed',
    },
  });
  const saves = recordSaves(page, runId);

  await openTheRunAt(page, runId);
  await expect(stepCheckbox(page, 'Step one')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next Task' }).click();
  await expect(page.getByRole('button', { name: 'Run completed' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save notes' })).toBeVisible();
  expect(saves).toEqual([]);

  await page.getByRole('button', { name: 'Share' }).click();
  const shareUrl = await page.getByRole('textbox', { name: 'Share link' }).inputValue();
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(shareUrl);
  await expect(guest.getByRole('heading', { name: 'Task B' })).toBeVisible();
  const guestBoxes = guest.getByRole('checkbox');
  await expect(guestBoxes).toHaveCount(4);
  for (const box of await guestBoxes.all()) await expect(box).toBeDisabled();
  await guest.close();

  expect(await readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });
  await deleteRun(page, runId);
});

test('a completed task can be found and unticked by its named checkbox', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Task checkbox QA ${Date.now()}`);

  await openTheRunAt(page, runId);
  const taskA = page.getByRole('checkbox', { name: 'Mark "Task A" complete' });
  await expect(taskA).not.toBeChecked();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();

  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(taskA).toBeChecked();
  await taskA.click();
  await expect(taskA).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toBeVisible();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [false, false] });

  await deleteRun(page, runId);
});
