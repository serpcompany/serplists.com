import { describe, expect, it, vi } from 'vitest';

import type { ChecklistRun } from '@/types/checklist';

import {
  completeRunExecution,
  saveRunExecutionTitle,
  toggleRunItem,
} from '@/features/run-execution/runExecutionActions';

import { buildRun, runExecutionApiClient, withEveryTaskAndSubTaskTicked } from '../../../fixtures/runExecutionFixtures';

describe('unsaved task notes ride along with the save that would lose them', () => {

  it('Mark Complete saves the draft notes of that task in the same PUT', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => ({ ...run, revision: 2 }));

    const result = await toggleRunItem(
      {
        isCompleted: true,
        itemId: 'item-1',
        noteDrafts: { 'item-1': 'Deployed build 42, see link', 'item-2': 'not this one' },
        run: buildRun(),
      },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledOnce();
    const sent = updateRun.mock.calls[0][0];
    expect(sent.revision).toBe(1);
    expect(sent.sections[0].items[0]).toMatchObject({ isCompleted: true, notes: 'Deployed build 42, see link' });
    expect(sent.sections[0].items[1].notes).toBeUndefined();
  });

  const runWhoseFirstTaskWasCompletedFirst = (notes?: string): ChecklistRun => {
    const run = buildRun();
    const [first, ...rest] = run.sections[0].items;
    const done = {
      ...first,
      isCompleted: true,
      notes,
      contents: first.contents?.map((content) => ({
        ...content,
        subItems: content.subItems?.map((sub) => ({ ...sub, isCompleted: true })),
      })),
    };
    return { ...run, sections: [{ ...run.sections[0], items: [done, ...rest] }] };
  };

  it('Mark Complete saves the draft notes of a task that a teammate or a queued Sub-task save already completed', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => ({ ...run, revision: 2 }));

    const result = await toggleRunItem(
      { isCompleted: true, itemId: 'item-1', noteDrafts: { 'item-1': 'x' }, run: runWhoseFirstTaskWasCompletedFirst() },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(updateRun).toHaveBeenCalledOnce();
    const sent = updateRun.mock.calls[0][0];
    expect(sent.revision).toBe(1);
    expect(sent.sections[0].items[0]).toMatchObject({ isCompleted: true, notes: 'x' });
    expect(sent.sections[0].items[0].contents?.[0]?.subItems?.every((sub) => sub.isCompleted)).toBe(true);
    expect(result).toMatchObject({ kind: 'ok', run: { revision: 2 } });
  });

  it('saves the draft through a shared link when the task is already complete', async () => {
    const client = { ...runExecutionApiClient(), updateSharedChecklist: vi.fn(async () => ({ revision: 2 })) };

    const result = await toggleRunItem(
      { isCompleted: true, itemId: 'item-1', noteDrafts: { 'item-1': 'x' }, run: runWhoseFirstTaskWasCompletedFirst(), shareToken: 'share-1' },
      { apiClient: client, updateRun: vi.fn() },
    );

    expect(client.updateSharedChecklist).toHaveBeenCalledOnce();
    expect(client.updateSharedChecklist.mock.calls[0]).toMatchObject([
      'share-1',
      { expected_revision: 1, sections: [{ items: [{ isCompleted: true, notes: 'x' }, {}] }] },
    ]);
    expect(result).toMatchObject({ kind: 'ok', run: { revision: 2 } });
  });

  it('sends nothing for a complete task whose draft matches its saved notes, or for another task', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = runWhoseFirstTaskWasCompletedFirst('x');

    const same = await toggleRunItem(
      { isCompleted: true, itemId: 'item-1', noteDrafts: { 'item-1': 'x', 'item-2': 'other task' }, run },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(same).toMatchObject({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('completing the run saves every draft before the page leaves', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const doneRun = withEveryTaskAndSubTaskTicked(buildRun());

    const result = await completeRunExecution(
      { noteDrafts: { 'item-1': 'first', 'item-2': 'second' }, run: doneRun },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledOnce();
    expect(updateRun.mock.calls[0][0].sections[0].items.map((item) => item.notes)).toEqual(['first', 'second']);
  });
});

describe('saving the run title, which a double click on Rename or Enter in the untouched editor submits unchanged', () => {
  it('does not send a PUT, which bumps the revision and writes an audit event, for an unchanged title, even with surrounding spaces', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const run = buildRun();

    const same = await saveRunExecutionTitle({ run, title: 'Launch checklist' }, { updateRun });
    const padded = await saveRunExecutionTitle({ run, title: '  Launch checklist  ' }, { updateRun });

    expect(same).toEqual({ kind: 'ok', run });
    expect(padded).toEqual({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('persists a changed title once, trimmed', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);

    const result = await saveRunExecutionTitle({ run: buildRun(), title: ' Launch v2 ' }, { updateRun });

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledTimes(1);
    expect(updateRun).toHaveBeenCalledWith(expect.objectContaining({ title: 'Launch v2' }), { includeTitle: true });
  });

  it("refuses a title over the API's 160-character limit with a clear message, not the API's raw schema error, and sends nothing", async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);

    const result = await saveRunExecutionTitle({ run: buildRun(), title: 'a'.repeat(161) }, { updateRun });

    expect(result).toEqual({ kind: 'error', message: 'Run title must be 160 characters or fewer.' });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('accepts a title at the limit, measured after trimming', async () => {
    const updateRun = vi.fn(async (run: ChecklistRun) => run);
    const title = 'a'.repeat(160);

    const result = await saveRunExecutionTitle({ run: buildRun(), title: `  ${title}  ` }, { updateRun });

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledWith(expect.objectContaining({ title }), { includeTitle: true });
  });
});
