import { expect, test, type Page } from '@playwright/test';

import { apiJson, apiRequest } from './support/api-requests';
import { openRunFromRunsList } from './support/navigation';
import { loginAsAdmin } from './support/sign-in';

const STRAY_SAVE_WINDOW_MS = 500;
const DIALOG_CLOSE_ANIMATION_MS = 400;
const RUN_TITLE_LIMIT = 160;

async function postRun(page: Page, body: Record<string, unknown>) {
  return (await apiJson<{ id: string }>(page, '/checklists', { method: 'POST', body })).id;
}

async function createRun(page: Page, title: string) {
  return postRun(page, {
    title,
    sections: [{ id: 'fin', title: 'Section', items: [
      { id: 'fin-a', title: 'Task A' },
      { id: 'fin-b', title: 'Task B' },
    ] }],
  });
}

async function deleteRun(page: Page, runId: string) {
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
}

async function fetchRunWithSections<Task>(page: Page, runId: string) {
  const run = await apiJson<{ status: string; title: string; items: unknown }>(page, `/checklists/${runId}`);
  const sections = (typeof run.items === 'string' ? JSON.parse(run.items) : run.items) as Array<{ items: Task[] }>;
  return { ...run, sections };
}

async function tickEveryTaskWithoutCompleting(page: Page, runId: string) {
  await apiJson(page, `/checklists/${runId}`, {
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

async function readRun(page: Page, runId: string) {
  const { status, sections } = await fetchRunWithSections<{ isCompleted?: boolean }>(page, runId);
  return { status, completed: sections.flatMap((section) => section.items.map((item) => item.isCompleted === true)) };
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

  const saves: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT') {
      saves.push(response.status());
    }
  });
  const conflictToast = page.getByText(/changed (while|since)/);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).dblclick();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false] });
  expect(saves).toEqual([200]);

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await page.getByRole('button', { name: 'Complete Run' }).dblclick();
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });
  expect(saves).toEqual([200, 200, 200]);
  await expect(conflictToast).toHaveCount(0);

  await deleteRun(page, runId);
});

test('a dismissed completion dialog can be reopened with Finish Run, and Not yet keeps the run in progress', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Finish run QA ${Date.now()}`);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
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
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });

  await deleteRun(page, runId);
});

test('a fully ticked run that is still in progress can be completed after a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Ticked elsewhere QA ${Date.now()}`);
  await tickEveryTaskWithoutCompleting(page, runId);

  await page.goto(`/dashboard/runs/${runId}/`);
  await page.getByRole('button', { name: 'Complete run' }).click();
  await page.getByRole('button', { name: 'Complete Run' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });

  await deleteRun(page, runId);
});

test('unsaved task notes are saved with Mark Complete and survive moving between tasks', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Notes draft QA ${Date.now()}`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });

  await page.goto(`/dashboard/runs/${runId}/`);
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

  await page.goto(`/dashboard/runs/${runId}/`);
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

async function tickElsewhere(page: Page, runId: string, ticked: { a: boolean; b: boolean }) {
  await apiJson(page, `/checklists/${runId}`, {
    method: 'PUT',
    body: {
      expected_revision: 1,
      sections: [{ id: 'fin', title: 'Section', items: [
        { id: 'fin-a', title: 'Task A', isCompleted: ticked.a },
        { id: 'fin-b', title: 'Task B', isCompleted: ticked.b },
      ] }],
      status: 'in_progress',
    },
  });
}

test('a tick saved by another session is kept and this page can still save', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Conflict QA ${Date.now()}`);
  const saves: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT') {
      saves.push(response.status());
    }
  });

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await tickElsewhere(page, runId, { a: false, b: true });
  saves.length = 0;

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('dialog', { name: 'Complete this Run?' })).toBeVisible();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, true] });
  expect(saves).toEqual([409, 200]);
  await expect(page.getByText(/changed (while|since|somewhere)/)).toHaveCount(0);

  await deleteRun(page, runId);
});

test('ticking a task another session already ticked does not untick it', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Same tick QA ${Date.now()}`);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await tickElsewhere(page, runId, { a: true, b: false });

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false] });
  await expect(page.getByText(/changed (while|since|somewhere)/)).toHaveCount(0);

  await deleteRun(page, runId);
});

async function createRunWithSubTasks(page: Page, title: string, stepTwoDone: boolean) {
  return postRun(page, {
    title,
    sections: [{ id: 'st', title: 'Section', items: [
      { id: 'st-a', title: 'Task A', contents: [{ type: 'subItems', value: '', subItems: [
        { id: 'st-a-1', title: 'Step one', isCompleted: false },
        { id: 'st-a-2', title: 'Step two', isCompleted: stepTwoDone },
      ] }] },
      { id: 'st-b', title: 'Task B' },
    ] }],
  });
}

async function readTaskA(page: Page, runId: string) {
  type Task = { isCompleted?: boolean; contents?: Array<{ subItems?: Array<{ isCompleted?: boolean }> }> };
  const { sections } = await fetchRunWithSections<Task>(page, runId);
  const task = sections[0].items[0];
  return [task.isCompleted === true, ...(task.contents?.[0]?.subItems ?? []).map((sub) => sub.isCompleted === true)];
}

async function holdFirstSave(page: Page, runId: string) {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let holding = true;
  await page.route(`**/api/checklists/${runId}`, async (route) => {
    if (route.request().method() === 'PUT' && holding) {
      holding = false;
      await held;
    }
    await route.continue();
  });
  return () => release();
}

const stepCheckbox = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).locator('..').getByRole('checkbox');

test('ticking the last sub-task, then Mark Complete during the save, keeps every sub-task ticked', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRunWithSubTasks(page, `Queued set QA ${Date.now()}`, true);
  const release = await holdFirstSave(page, runId);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await stepCheckbox(page, 'Step one').click();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  release();

  await expect.poll(() => readTaskA(page, runId)).toEqual([true, true, true]);
  await page.unroute(`**/api/checklists/${runId}`);
  await page.reload();
  await expect.poll(() => readTaskA(page, runId)).toEqual([true, true, true]);

  await deleteRun(page, runId);
});

test('Mark Complete, then ticking a sub-task that still looks unticked, keeps it ticked', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRunWithSubTasks(page, `Queued set QA ${Date.now()}`, false);
  const release = await holdFirstSave(page, runId);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await stepCheckbox(page, 'Step one').click();
  release();

  await expect.poll(() => readTaskA(page, runId)).toEqual([true, true, true]);
  await page.unroute(`**/api/checklists/${runId}`);

  await deleteRun(page, runId);
});

function recordSaves(page: Page, runId: string) {
  const saves: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT') {
      saves.push(response.status());
    }
  });
  return saves;
}

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

test('a completed run cannot be unticked, privately or through its share link, and its notes stay editable', async ({ page, browser }) => {
  await loginAsAdmin(page);
  const runId = await createRunWithSubTasks(page, `Frozen run QA ${Date.now()}`, true);
  await apiJson(page, `/checklists/${runId}`, {
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

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
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

test('the run Changelog shows a save without a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Changelog QA ${Date.now()}`);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  const changelog = page.locator('section', { has: page.getByRole('heading', { name: 'Changelog' }) });
  await expect(changelog.getByText('Created run')).toBeVisible();
  await expect(changelog.getByText('Updated run')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect(changelog.getByText('Updated run')).toBeVisible();

  await deleteRun(page, runId);
});

async function createFourTaskRun(page: Page, title: string) {
  return postRun(page, {
    title,
    sections: [{ id: 'mv', title: 'Section', items: ['A', 'B', 'C', 'D'].map((name) => ({
      id: `mv-${name.toLowerCase()}`,
      title: `Task ${name}`,
    })) }],
  });
}

async function holdEverySave(page: Page, runId: string) {
  const held: Array<() => void> = [];
  await page.route(`**/api/checklists/${runId}`, async (route) => {
    if (route.request().method() === 'PUT') await new Promise<void>((resolve) => held.push(resolve));
    await route.continue();
  });
  return async () => {
    await expect.poll(() => held.length).toBeGreaterThan(0);
    held.shift()?.();
  };
}

test('a task opened while Mark Complete is saving stays open when the save lands', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createFourTaskRun(page, `Move on during save QA ${Date.now()}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  const releaseNextSave = await holdEverySave(page, runId);
  const notes = page.getByRole('textbox', { name: 'Task notes' });

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await page.getByRole('navigation', { name: 'Run tasks' }).getByRole('button', { name: 'Task D' }).click();
  await expect(page.getByRole('heading', { name: 'Task D' })).toBeVisible();
  await notes.fill('Started on D');
  await releaseNextSave();

  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false, false, false] });
  await expect(page.getByRole('heading', { name: 'Task D' })).toBeVisible();
  await expect(notes).toHaveValue('Started on D');

  await deleteRun(page, runId);
});

test('queued Mark Complete saves never move back to an earlier task', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createFourTaskRun(page, `Queued move on QA ${Date.now()}`);
  const releaseNextSave = await holdEverySave(page, runId);
  const next = page.getByRole('button', { name: 'Next', exact: true });

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await next.click();
  await expect(page.getByRole('heading', { name: 'Task C' })).toBeVisible();

  await releaseNextSave();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false, false, false] });
  await expect(page.getByRole('heading', { name: 'Task C' })).toBeVisible();
  await releaseNextSave();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, true, false, false] });
  await expect(page.getByRole('heading', { name: 'Task C' })).toBeVisible();

  await deleteRun(page, runId);
});

test('a completed task can be found and unticked by its named checkbox', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Task checkbox QA ${Date.now()}`);

  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
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

test('the run title editor stops at the length the API accepts, and the save goes through', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Title limit QA ${Date.now()}`);
  const longTitle = 'Quarterly vendor onboarding '.repeat(7);

  await page.goto(`/dashboard/runs/${runId}/`);
  await page.getByRole('button', { name: 'Rename' }).click();
  const titleInput = page.getByRole('textbox', { name: 'Run title' });
  await titleInput.clear();
  await titleInput.pressSequentially(longTitle.slice(0, RUN_TITLE_LIMIT + 10));
  await expect(titleInput).toHaveValue(longTitle.slice(0, RUN_TITLE_LIMIT));
  await page.getByRole('button', { name: 'Save title' }).click();
  await expect(page.getByText('Run title updated')).toBeVisible();
  await expect(page.getByText(/String must contain/)).toHaveCount(0);

  const { title } = await fetchRunWithSections(page, runId);
  expect(title).toBe(longTitle.slice(0, RUN_TITLE_LIMIT).trim());

  await deleteRun(page, runId);
});

const NOTES_LEAVE_MESSAGE = 'You have unsaved task notes. Leave without saving?';

test('asks before unsaved task notes are lost through the app shell, Back or Sign out', async ({ page }) => {
  await loginAsAdmin(page);
  const title = `Notes leave guard QA ${Date.now()}`;
  const runId = await createRun(page, title);
  const runUrl = new RegExp(`/dashboard/runs/${runId}/$`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });
  const accountMenu = page.getByRole('button', { name: 'Account menu' });
  const sidebarTemplates = page.getByRole('navigation', { name: 'Dashboard' }).getByRole('link', { name: 'Templates', exact: true });
  const dialogs: string[] = [];
  let acceptDialogs = false;
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await (acceptDialogs ? dialog.accept() : dialog.dismiss());
  });

  await openRunFromRunsList(page, title);
  await expect(page).toHaveURL(runUrl);
  await expect(page.getByRole('heading', { name: 'Task A' })).toBeVisible();
  await notes.fill('Deployed build 42');

  const expectStillOnRun = async (asked: number) => {
    await expect.poll(() => dialogs.length).toBe(asked);
    expect(dialogs.at(-1)).toBe(NOTES_LEAVE_MESSAGE);
    await expect(page).toHaveURL(runUrl);
    await expect(notes).toHaveValue('Deployed build 42');
  };

  await sidebarTemplates.click();
  await expectStillOnRun(1);

  await page.goBack();
  await expectStillOnRun(2);

  await accountMenu.click();
  await page.getByRole('menuitem', { name: 'My Templates' }).click();
  await expectStillOnRun(3);

  await accountMenu.click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expectStillOnRun(4);
  await expect(page.getByRole('button', { name: 'Switch context' })).toBeVisible();

  await page.getByRole('button', { name: 'Runs', exact: true }).click();
  await expectStillOnRun(5);

  acceptDialogs = true;
  await sidebarTemplates.click();
  await expect(page).toHaveURL(/\/dashboard\/templates\/$/);
  expect(dialogs).toHaveLength(6);

  await deleteRun(page, runId);
});

test('completing a run saves an unsaved note and leaves without asking', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Notes complete QA ${Date.now()}`);
  const notes = page.getByRole('textbox', { name: 'Task notes' });
  const dialogs: string[] = [];
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await page.goto(`/dashboard/runs/${runId}/`);
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('dialog', { name: 'Complete this Run?' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await notes.fill('Signed off by QA');
  await page.getByRole('button', { name: 'Finish Run' }).click();
  await page.getByRole('button', { name: 'Complete Run' }).click();
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  expect(dialogs).toEqual([]);

  const { status, sections } = await fetchRunWithSections<{ notes?: string }>(page, runId);
  const stored = { status, notes: sections.flatMap((section) => section.items.map((item) => item.notes ?? '')) };
  expect(stored).toEqual({ status: 'completed', notes: ['', 'Signed off by QA'] });

  await deleteRun(page, runId);
});

test('a share-link guest is asked before unsaved task notes are lost', async ({ browser, page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Shared notes leave guard QA ${Date.now()}`);
  const { shareToken } = await apiJson<{ shareToken: string }>(page, `/checklists/run/${runId}/share`, {
    method: 'POST',
    body: {},
  });

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const dialogs: string[] = [];
  let acceptDialogs = false;
  guest.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await (acceptDialogs ? dialog.accept() : dialog.dismiss());
  });
  const sharedUrl = new RegExp(`/share/${shareToken}/$`);
  const browse = guest.getByRole('link', { name: 'Browse the Template Library' });
  const notes = guest.getByRole('textbox', { name: 'Task notes' }).first();

  await guest.goto(`/share/${shareToken}/`);
  await notes.fill('Checked by the guest');
  await browse.click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toBe(NOTES_LEAVE_MESSAGE);
  await expect(guest).toHaveURL(sharedUrl);
  await expect(notes).toHaveValue('Checked by the guest');

  acceptDialogs = true;
  await browse.click();
  await expect(guest).toHaveURL(/\/templates\/$/);
  expect(dialogs).toHaveLength(2);

  await guestContext.close();
  await deleteRun(page, runId);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`at ${viewport.width}px Mark Complete stays in view and in place while the Changelog grows`, async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(viewport);
    const tasks = ['Check DNS', 'Check TLS', 'Check redirects', 'Check sitemap'];
    const runId = await postRun(page, {
      title: `Footer QA ${Date.now()}`,
      sections: [{ id: 'foot', title: 'Section', items: tasks.map((title, index) => ({ id: `foot-${index}`, title })) }],
    });
    const markComplete = page.getByRole('button', { name: 'Mark Complete' });
    const changelogEntries = page
      .locator('section', { has: page.getByRole('heading', { name: 'Changelog' }) })
      .locator('time');

    await page.goto(`/dashboard/runs/${runId}/`);
    await expect(page.getByRole('heading', { name: tasks[0] })).toBeVisible();
    await expect(changelogEntries).toHaveCount(1);
    const first = await markComplete.boundingBox();
    if (!first) throw new Error('Mark Complete is not shown');
    expect(first.y + first.height).toBeLessThanOrEqual(viewport.height);

    for (const [index, next] of tasks.slice(1).entries()) {
      await markComplete.click();
      await expect(page.getByRole('heading', { name: next })).toBeVisible();
      await expect(changelogEntries).toHaveCount(index + 2);
      const box = await markComplete.boundingBox();
      expect(Math.abs((box?.y ?? Number.NaN) - first.y)).toBeLessThanOrEqual(1);
    }

    await deleteRun(page, runId);
  });
}
