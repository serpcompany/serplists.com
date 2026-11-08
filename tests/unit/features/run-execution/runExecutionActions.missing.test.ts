import { describe, expect, it, vi } from 'vitest';

import {
  bindRunSaves,
  completeRunExecution,
  saveRunExecutionTitle,
  saveRunFormAnswer,
  saveRunItemNotes,
  toggleRunItem,
  toggleRunSubItem,
} from '@/features/run-execution/runExecutionActions';
import { createRunSaver } from '@/features/run-execution/runSaver';
import { ApiError } from '@/lib/api-errors';
import type { ChecklistRun } from '@/types/checklist';

import { buildRun, runExecutionApiClient } from '../../../fixtures/runExecutionFixtures';
import { runWithOneField } from '../../../support/runAnswers';

const savingNothing = () => {
  const updateRun = vi.fn(async (run: ChecklistRun) => run);
  return { updateRun, dependencies: { apiClient: runExecutionApiClient(), updateRun } };
};

const failingWith = (failure: unknown) => ({
  apiClient: runExecutionApiClient(),
  updateRun: vi.fn(async (): Promise<ChecklistRun> => {
    throw failure;
  }),
});

const withATaskThatHasNoBlocks = (): ChecklistRun =>
  buildRun({ sections: [{ id: 'section-1', title: 'Checklist', items: [{ id: 'item-bare', title: 'Bare task', isCompleted: false }] }] });

const withAFormBlockThatHasNoFields = (): ChecklistRun =>
  buildRun({ sections: [{ id: 'section-1', title: 'Intake', items: [{ id: 'item-form', title: 'Collect', contents: [{ id: 'form-1', type: 'form', value: '' }] }] }] });

const RUN_CHANGED_ELSEWHERE =
  'This run was changed somewhere else. The latest version is shown now; check it and try again.';

describe('a change to a task the run no longer holds, as after its template was edited in another tab', () => {
  it('saves nothing and says the task was not found', async () => {
    const { updateRun, dependencies } = savingNothing();
    const run = buildRun();

    const results = [
      await toggleRunItem({ isCompleted: true, itemId: 'item-gone', run }, dependencies),
      await toggleRunSubItem({ contentIndex: 0, isCompleted: true, itemId: 'item-gone', run, subItemIndex: 0 }, dependencies),
      await toggleRunSubItem({ contentIndex: 0, isCompleted: true, itemId: 'item-bare', run: withATaskThatHasNoBlocks(), subItemIndex: 0 }, dependencies),
      await toggleRunSubItem({ contentIndex: 0, isCompleted: true, itemId: 'item-1', run, subItemId: 'sub-gone', subItemIndex: 9 }, dependencies),
      await saveRunItemNotes({ itemId: 'item-gone', notes: 'Lost', run }, dependencies),
      await saveRunFormAnswer({ answer: 'Acme', fieldId: 'field-gone', itemId: 'item-gone', run }, dependencies),
      await saveRunFormAnswer({ answer: 'Acme', fieldId: 'field-name', itemId: 'item-form', run: withAFormBlockThatHasNoFields() }, dependencies),
      await saveRunFormAnswer({ answer: 'Acme', fieldId: 'field-name', itemId: 'item-bare', run: withATaskThatHasNoBlocks() }, dependencies),
    ];

    expect(results).toEqual(Array.from({ length: results.length }, () => ({ kind: 'not_found' })));
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('says the run was not found when the page holds none', async () => {
    const { updateRun, dependencies } = savingNothing();

    expect(await toggleRunItem({ isCompleted: true, itemId: 'item-1', run: null }, dependencies)).toEqual({ kind: 'not_found' });
    expect(await saveRunItemNotes({ itemId: 'item-1', notes: 'Hello', run: null }, dependencies)).toEqual({ kind: 'not_found' });
    expect(await completeRunExecution({ run: null }, dependencies)).toEqual({ kind: 'not_found' });
    expect(updateRun).not.toHaveBeenCalled();
  });
});

describe('a save of a run the server refuses', () => {
  it("shows the server's reason and keeps its code", async () => {
    const refusal = new ApiError({ status: 409, code: 'edit_conflict', message: 'This run changed elsewhere.' });

    expect(await saveRunItemNotes({ itemId: 'item-1', notes: 'Hello', run: buildRun() }, failingWith(refusal))).toEqual({
      kind: 'error',
      message: 'This run changed elsewhere.',
      code: 'edit_conflict',
    });
  });

  it('names what failed when the failure carries no message', async () => {
    const field = { id: 'field-name', label: 'Client name', kind: 'text' as const, required: false };
    const dependencies = failingWith('offline');

    expect(await saveRunItemNotes({ itemId: 'item-1', notes: 'Hello', run: buildRun() }, dependencies)).toEqual({
      kind: 'error',
      message: 'Unable to save task notes.',
    });
    expect(await saveRunFormAnswer({ answer: 'Acme', fieldId: 'field-name', itemId: 'task-one', run: runWithOneField(field) }, dependencies)).toEqual({
      kind: 'error',
      message: 'Unable to save your answer.',
    });
    expect(await saveRunExecutionTitle({ run: buildRun(), title: 'Launch checklist v2' }, dependencies)).toEqual({
      kind: 'error',
      message: 'Unable to update the run title.',
    });
  });
});

describe('renaming a run', () => {
  it('is refused through a share link, and for a page holding no run', async () => {
    const { updateRun, dependencies } = savingNothing();

    expect(await saveRunExecutionTitle({ run: buildRun(), shareToken: 'token-1', title: 'Renamed' }, dependencies)).toEqual({ kind: 'shared_disabled' });
    expect(await saveRunExecutionTitle({ run: null, title: 'Renamed' }, dependencies)).toEqual({ kind: 'not_found' });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('is not retried over a name someone else gave the run meanwhile', async () => {
    const dependencies = failingWith(new ApiError({ status: 409, code: 'edit_conflict', message: 'Checklist run changed since it was loaded.' }));
    const saves = bindRunSaves({ dependencies, noteDrafts: () => ({}) });
    const renamedElsewhere = buildRun({ title: 'Launch for Beta', revision: 2 });

    const result = await createRunSaver()(saves.title('Launch for Acme'), {
      apply: (applied) => applied,
      latest: () => buildRun(),
      onNotFound: () => undefined,
      reload: async () => ({ kind: 'ok', mode: 'private', run: renamedElsewhere, selectedItemId: null }),
    });

    expect(result).toEqual({ kind: 'error', message: RUN_CHANGED_ELSEWHERE });
    expect(dependencies.updateRun).toHaveBeenCalledTimes(1);
  });
});

describe('an answer whose task was removed elsewhere before it saved', () => {
  it('is not retried on the reloaded run', async () => {
    const field = { id: 'field-name', label: 'Client name', kind: 'text' as const, required: false, answer: 'Old answer' };
    const dependencies = failingWith(new ApiError({ status: 409, code: 'edit_conflict', message: 'Checklist run changed since it was loaded.' }));
    const saves = bindRunSaves({ dependencies, noteDrafts: () => ({}) });

    const result = await createRunSaver()(saves.answer('task-one', 'field-name', 'New answer'), {
      apply: (applied) => applied,
      latest: () => runWithOneField(field),
      onNotFound: () => undefined,
      reload: async () => ({ kind: 'ok', mode: 'private', run: buildRun({ revision: 2 }), selectedItemId: null }),
    });

    expect(result).toEqual({ kind: 'error', message: RUN_CHANGED_ELSEWHERE });
    expect(dependencies.updateRun).toHaveBeenCalledTimes(1);
  });
});

