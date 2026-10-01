import { expect, test, type Page } from '@playwright/test';

import { loginAsAdmin } from './support/sign-in';
import { createRun, deleteRun, readRun, recordSaves, tickElsewhere } from './support/run-saves';

const STRAY_SAVE_WINDOW_MS = 500;
const DIALOG_CLOSE_ANIMATION_MS = 400;

type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number } | null;

const isInside = (box: Box, point: Point) =>
  box !== null && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;

async function scrollToAndPointAt(page: Page, name: string): Promise<Point> {
  const button = page.getByRole('button', { name });
  await button.evaluate((element) => element.scrollIntoView({ block: 'nearest' }));
  const box = await button.boundingBox();
  if (!box) throw new Error(`${name} is not visible`);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(point.x, point.y);
  return point;
}

async function clickAtPointer(page: Page, clickCount: number) {
  await page.mouse.down({ clickCount });
  await page.mouse.up({ clickCount });
}

async function allowTimeForAStraySave(page: Page) {
  await page.waitForTimeout(STRAY_SAVE_WINDOW_MS);
}

async function flushSaveQueueWithANotesSave(page: Page, notes: string) {
  await page.getByRole('textbox', { name: 'Task notes' }).fill(notes);
  await page.getByRole('button', { name: 'Save notes' }).click();
  await expect(page.getByText('Saved to this run')).toBeVisible();
}

async function waitForDialogNodeWithinDoubleClickInterval(page: Page) {
  await page.waitForFunction(() => document.querySelector('[role="dialog"]') !== null, undefined, {
    polling: 'raf',
  });
}

async function allowTimeForADialogToClose(page: Page) {
  await page.waitForTimeout(DIALOG_CLOSE_ANIMATION_MS);
}

test('a double click on Next Task moves on without completing the next task', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Next Task double click QA ${Date.now()}`);
  await tickElsewhere(page, runId, { a: true, b: false });
  const saves = recordSaves(page, runId);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await page.getByRole('button', { name: 'Next Task' }).dblclick();
  await allowTimeForAStraySave(page);

  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark Complete' })).toBeVisible();
  expect(await readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false] });
  expect(saves).toEqual([]);

  await deleteRun(page, runId);
});

test('the second click of a double click after a fast save does not complete the next task', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Fast save double click QA ${Date.now()}`);
  const saves = recordSaves(page, runId);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await scrollToAndPointAt(page, 'Mark Complete');
  await clickAtPointer(page, 1);
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await scrollToAndPointAt(page, 'Mark Complete');
  await clickAtPointer(page, 2);

  await flushSaveQueueWithANotesSave(page, 'Checked after the double click');

  expect(await readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false] });
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  expect(saves).toEqual([200, 200]);

  await deleteRun(page, runId);
});

test('the rest of the double click that completes the last task keeps the completion dialog open', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Dialog double click QA ${Date.now()}`);
  await tickElsewhere(page, runId, { a: true, b: false });

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  const doubleClickPoint = await scrollToAndPointAt(page, 'Mark Complete');
  await clickAtPointer(page, 1);
  await waitForDialogNodeWithinDoubleClickInterval(page);
  await clickAtPointer(page, 2);
  const dialog = page.getByRole('dialog', { name: 'Complete this Run?' });
  const secondClickLandedInDialog = isInside(await dialog.boundingBox(), doubleClickPoint);
  expect(secondClickLandedInDialog).toBe(false);

  await allowTimeForADialogToClose(page);
  await expect(dialog).toBeVisible();
  expect(await readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, true] });

  await dialog.getByRole('button', { name: 'Complete Run' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });

  await deleteRun(page, runId);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
  test(`at ${viewport.width}px a double click on Rename opens the editor and saves nothing`, async ({ page }) => {
    await loginAsAdmin(page);
    const runId = await createRun(page, `Rename double click QA ${Date.now()}`);
    await page.setViewportSize(viewport);
    const saves = recordSaves(page, runId);

    await page.goto(`/dashboard/runs/${runId}/`);
    await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
    await page.getByRole('button', { name: 'Rename' }).dblclick();

    const titleInput = page.getByRole('textbox', { name: 'Run title' });
    await expect(titleInput).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save title' })).toBeDisabled();

    await titleInput.press('Enter');
    await expect(titleInput).toHaveCount(0);
    await expect(page.getByText('Run title updated')).toHaveCount(0);
    expect(saves).toEqual([]);

    await deleteRun(page, runId);
  });
}
