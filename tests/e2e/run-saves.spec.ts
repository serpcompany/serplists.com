import { expect, test, type Page } from '@playwright/test';

import { firstOf } from '../support/elements';
import { loginAsAdmin } from './support/sign-in';
import {
  createRun,
  createRunWithSubTasks,
  deleteRun,
  fetchRunWithSections,
  openTheRunAt,
  postRun,
  readRun,
  recordSaves,
  stepCheckbox,
  tickElsewhere,
} from './support/run-saves';

const RUN_TITLE_LIMIT = 160;

const expectTaskAAndBothStepsTicked = (page: Page, runId: string) =>
  expect.poll(() => readTaskA(page, runId)).toEqual([true, true, true]);

test('a tick saved by another session is kept and this page can still save', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Conflict QA ${Date.now()}`);
  const saves = recordSaves(page, runId);

  await openTheRunAt(page, runId);
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

  await openTheRunAt(page, runId);
  await tickElsewhere(page, runId, { a: true, b: false });

  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await expect(page.getByRole('heading', { name: 'Task B' })).toBeVisible();
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'in_progress', completed: [true, false] });
  await expect(page.getByText(/changed (while|since|somewhere)/)).toHaveCount(0);

  await deleteRun(page, runId);
});

async function readTaskA(page: Page, runId: string) {
  const { sections } = await fetchRunWithSections(page, runId);
  const task = firstOf(firstOf(sections).items);
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

test('ticking the last sub-task, then Mark Complete during the save, keeps every sub-task ticked', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRunWithSubTasks(page, `Queued set QA ${Date.now()}`, true);
  const release = await holdFirstSave(page, runId);

  await openTheRunAt(page, runId);
  await stepCheckbox(page, 'Step one').click();
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  release();

  await expectTaskAAndBothStepsTicked(page, runId);
  await page.unroute(`**/api/checklists/${runId}`);
  await page.reload();
  await expectTaskAAndBothStepsTicked(page, runId);

  await deleteRun(page, runId);
});

test('Mark Complete, then ticking a sub-task that still looks unticked, keeps it ticked', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRunWithSubTasks(page, `Queued set QA ${Date.now()}`, false);
  const release = await holdFirstSave(page, runId);

  await openTheRunAt(page, runId);
  await page.getByRole('button', { name: 'Mark Complete' }).click();
  await stepCheckbox(page, 'Step one').click();
  release();

  await expectTaskAAndBothStepsTicked(page, runId);
  await page.unroute(`**/api/checklists/${runId}`);

  await deleteRun(page, runId);
});

test('the run Changelog shows a save without a reload', async ({ page }) => {
  await loginAsAdmin(page);
  const runId = await createRun(page, `Changelog QA ${Date.now()}`);

  await openTheRunAt(page, runId);
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

  await openTheRunAt(page, runId);
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

  await openTheRunAt(page, runId);
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

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`at ${viewport.width}px Mark Complete stays in view and in place while the Changelog grows`, async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize(viewport);
    const firstTask = 'Check DNS';
    const tasks = [firstTask, 'Check TLS', 'Check redirects', 'Check sitemap'];
    const runId = await postRun(page, {
      title: `Footer QA ${Date.now()}`,
      sections: [{ id: 'foot', title: 'Section', items: tasks.map((title, index) => ({ id: `foot-${index}`, title })) }],
    });
    const markComplete = page.getByRole('button', { name: 'Mark Complete' });
    const changelogEntries = page
      .locator('section', { has: page.getByRole('heading', { name: 'Changelog' }) })
      .locator('time');

    await page.goto(`/dashboard/runs/${runId}/`);
    await expect(page.getByRole('heading', { name: firstTask })).toBeVisible();
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
