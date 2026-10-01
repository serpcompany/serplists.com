import { expect, type Page } from '@playwright/test';

import { apiJson, apiRequest } from './api-requests';

export async function postRun(page: Page, body: Record<string, unknown>) {
  return (await apiJson<{ id: string }>(page, '/checklists', { method: 'POST', body })).id;
}

export async function createRun(page: Page, title: string) {
  return postRun(page, {
    title,
    sections: [{ id: 'fin', title: 'Section', items: [
      { id: 'fin-a', title: 'Task A' },
      { id: 'fin-b', title: 'Task B' },
    ] }],
  });
}

export async function deleteRun(page: Page, runId: string) {
  await apiRequest(page, `/checklists/${runId}`, { method: 'DELETE' });
}

export async function fetchRunWithSections<Task>(page: Page, runId: string) {
  const run = await apiJson<{ status: string; title: string; items: unknown }>(page, `/checklists/${runId}`);
  const sections = (typeof run.items === 'string' ? JSON.parse(run.items) : run.items) as Array<{ items: Task[] }>;
  return { ...run, sections };
}

export async function readRun(page: Page, runId: string) {
  const { status, sections } = await fetchRunWithSections<{ isCompleted?: boolean }>(page, runId);
  return { status, completed: sections.flatMap((section) => section.items.map((item) => item.isCompleted === true)) };
}

export async function tickElsewhere(page: Page, runId: string, ticked: { a: boolean; b: boolean }) {
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

export async function createRunWithSubTasks(page: Page, title: string, stepTwoDone: boolean) {
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

export const stepCheckbox = (page: Page, title: string) =>
  page.getByText(title, { exact: true }).locator('..').getByRole('checkbox');

export function recordSaves(page: Page, runId: string) {
  const saves: number[] = [];
  page.on('response', (response) => {
    if (response.url().includes(`/api/checklists/${runId}`) && response.request().method() === 'PUT') {
      saves.push(response.status());
    }
  });
  return saves;
}

export const runIdInTheUrl = (page: Page) =>
  decodeURIComponent(new URL(page.url()).pathname.split('/').filter(Boolean).pop() ?? '');

export async function startARunFromTheFirstStartRun(page: Page) {
  await page.getByRole('button', { name: 'Start Run' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Start a Run' });
  await dialog.getByRole('button', { name: 'Start Run' }).click();
  return dialog;
}

export async function openTheRunAt(page: Page, runId: string, taskTitle = 'Task A') {
  await page.goto(`/dashboard/runs/${runId}/`);
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible();
}

export async function expectBackOnTheRunsListWithTheRunCompleted(page: Page, runId: string) {
  await expect(page).toHaveURL(/\/dashboard\/runs\/$/);
  await expect.poll(() => readRun(page, runId)).toEqual({ status: 'completed', completed: [true, true] });
}

export async function openTheRunAtDesktopWidth(page: Page, runId: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/dashboard/runs/${runId}/`);
}
