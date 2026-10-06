import { describe, expect, it, vi } from 'vitest';

import {
  bindRunSaves,
  saveRunFormAnswer,
  toggleRunItem,
  toggleRunSubItem,
} from '@/features/run-execution/runExecutionActions';
import { isRunItemFinished } from '@/features/run-execution/runExecutionMappers';
import { createRunSaver } from '@/features/run-execution/runSaver';
import { ApiError } from '@/lib/api-errors';
import { FORM_INCOMPLETE_CODE } from '@/lib/schemas/formValidation';
import type { ChecklistFormField, ChecklistItem, ChecklistRun, FormAnswer } from '@/types/checklist';

import { buildRun, runExecutionApiClient } from '../../../fixtures/runExecutionFixtures';
import { contentAt, firstOf, taskAt } from '../../../support/elements';

const FIELDS: ChecklistFormField[] = [
  { id: 'field-name', label: 'Client name', kind: 'text', required: true },
  { id: 'field-site', label: 'Website', kind: 'url', required: false },
];

const formTask = (overrides: Partial<ChecklistItem> = {}, answers: Record<string, FormAnswer> = {}): ChecklistItem => ({
  id: 'item-form',
  title: 'Collect details',
  isCompleted: false,
  contents: [
    { type: 'subItems', value: '', subItems: [{ id: 'sub-call', title: 'Call the client', isCompleted: false }] },
    {
      id: 'form-1',
      type: 'form',
      value: '',
      fields: FIELDS.map((field) => (answers[field.id] === undefined ? field : { ...field, answer: answers[field.id] })),
    },
  ],
  ...overrides,
});

const runWith = (task: ChecklistItem): ChecklistRun =>
  buildRun({ sections: [{ id: 'section-1', title: 'Intake', items: [task] }] });

const savingRun = () => vi.fn(async (run: ChecklistRun) => ({ ...run, revision: (run.revision ?? 1) + 1 }));

const fieldsOf = (run: ChecklistRun | undefined): ChecklistFormField[] =>
  (run ? contentAt(taskAt(run, 0, 0), 1).fields : undefined) ?? [];

describe('saving a form answer on the Run page', () => {
  it('saves the answer on its field, by field id, without changing the run it was given', async () => {
    const updateRun = savingRun();
    const run = runWith(formTask());

    const result = await saveRunFormAnswer(
      { answer: 'Acme', fieldId: 'field-name', itemId: 'item-form', run },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(result.kind).toBe('ok');
    expect(updateRun).toHaveBeenCalledOnce();
    expect(fieldsOf(firstOf(updateRun.mock.calls)[0])[0]?.answer).toBe('Acme');
    expect(fieldsOf(run)[0]?.answer).toBeUndefined();
    expect(result.kind === 'ok' ? result.run?.revision : undefined).toBe(2);
  });

  it('clears an answer, and sends nothing when the answer is what the run already holds', async () => {
    const updateRun = savingRun();
    const run = runWith(formTask({}, { 'field-site': 'https://example.com' }));
    const dependencies = { apiClient: runExecutionApiClient(), updateRun };

    await saveRunFormAnswer({ answer: undefined, fieldId: 'field-site', itemId: 'item-form', run }, dependencies);
    expect(fieldsOf(firstOf(updateRun.mock.calls)[0])[1]?.answer).toBeUndefined();

    updateRun.mockClear();
    const unchanged = await saveRunFormAnswer(
      { answer: 'https://example.com', fieldId: 'field-site', itemId: 'item-form', run },
      dependencies,
    );
    expect(unchanged).toEqual({ kind: 'ok', run });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('refuses an answer on a completed run, through a share link, or for a field the task does not have', async () => {
    const updateRun = savingRun();
    const apiClient = runExecutionApiClient();
    const dependencies = { apiClient, updateRun };
    const open = runWith(formTask());

    expect(await saveRunFormAnswer(
      { answer: 'Acme', fieldId: 'field-name', itemId: 'item-form', run: { ...open, status: 'completed' } },
      dependencies,
    )).toMatchObject({ kind: 'error' });
    expect(await saveRunFormAnswer(
      { answer: 'Acme', fieldId: 'field-name', itemId: 'item-form', run: open, shareToken: 'share-1' },
      dependencies,
    )).toEqual({ kind: 'shared_disabled' });
    expect(await saveRunFormAnswer(
      { answer: 'Acme', fieldId: 'field-gone', itemId: 'item-form', run: open },
      dependencies,
    )).toEqual({ kind: 'not_found' });
    expect(updateRun).not.toHaveBeenCalled();
    expect(apiClient.updateSharedChecklist).not.toHaveBeenCalled();
  });

  it('queues each answer under its own key, so a double save is dropped but a changed answer is not, and retries only when no one else changed it', () => {
    const saves = bindRunSaves({ dependencies: { updateRun: savingRun() }, noteDrafts: () => ({}) });
    const before = runWith(formTask());

    expect(saves.answer('item-form', 'field-name', 'Acme').key).toBe(saves.answer('item-form', 'field-name', 'Acme').key);
    expect(saves.answer('item-form', 'field-name', 'Acme').key).not.toBe(saves.answer('item-form', 'field-name', 'Acme Inc').key);

    const { canRetryOn } = saves.answer('item-form', 'field-name', 'Acme').bind(before);
    expect(canRetryOn?.(runWith(formTask({ title: 'Renamed' })))).toBe(true);
    expect(canRetryOn?.(runWith(formTask({}, { 'field-name': 'Other answer' })))).toBe(false);
  });
});

describe('a task whose form blocks it', () => {
  it('cannot be marked complete: the save is refused, names the first blocking field, and sends nothing', async () => {
    const updateRun = savingRun();

    const result = await toggleRunItem(
      { isCompleted: true, itemId: 'item-form', run: runWith(formTask()) },
      { apiClient: runExecutionApiClient(), updateRun },
    );

    expect(result).toEqual({
      kind: 'error',
      code: FORM_INCOMPLETE_CODE,
      message: "Finish this task's form first. Client name: Fill in this field.",
    });
    expect(updateRun).not.toHaveBeenCalled();
  });

  it('names an invalid answer by what the field needs, and refuses Mark Complete on a task stored as ticked', async () => {
    const result = await toggleRunItem(
      { isCompleted: true, itemId: 'item-form', run: runWith(formTask({ isCompleted: true }, { 'field-name': 'Acme', 'field-site': 'example.com' })) },
      { apiClient: runExecutionApiClient(), updateRun: savingRun() },
    );

    expect(result).toMatchObject({ code: FORM_INCOMPLETE_CODE, message: "Finish this task's form first. Website: Enter a URL that starts with http:// or https://." });
  });

  it('can still be unticked, and is completed once its required fields are answered', async () => {
    const updateRun = savingRun();
    const dependencies = { apiClient: runExecutionApiClient(), updateRun };

    expect((await toggleRunItem({ isCompleted: false, itemId: 'item-form', run: runWith(formTask({ isCompleted: true })) }, dependencies)).kind).toBe('ok');
    const answered = await toggleRunItem(
      { isCompleted: true, itemId: 'item-form', run: runWith(formTask({}, { 'field-name': 'Acme' })) },
      dependencies,
    );

    expect(answered.kind).toBe('ok');
    expect(answered.kind === 'ok' && answered.run ? taskAt(answered.run, 0, 0).isCompleted : null).toBe(true);
  });

  it('is not ticked when its last Sub-task is, until the form is answered', async () => {
    const dependencies = { apiClient: runExecutionApiClient(), updateRun: savingRun() };
    const tickTheSubTask = (task: ChecklistItem) =>
      toggleRunSubItem({ contentIndex: 0, isCompleted: true, itemId: 'item-form', run: runWith(task), subItemIndex: 0 }, dependencies);

    const blocked = await tickTheSubTask(formTask());
    const answered = await tickTheSubTask(formTask({}, { 'field-name': 'Acme' }));

    expect(blocked.kind === 'ok' && blocked.run ? taskAt(blocked.run, 0, 0).isCompleted : null).toBe(false);
    expect(answered.kind === 'ok' && answered.run ? taskAt(answered.run, 0, 0).isCompleted : null).toBe(true);
  });

  it('counts a task stored as ticked as finished whatever its form holds, since a form gates ticking its task and not the run', () => {
    const ticked = formTask({
      isCompleted: true,
      contents: [{ id: 'form-1', type: 'form', value: '', fields: FIELDS }],
    });

    expect(isRunItemFinished(ticked)).toBe(true);
    expect(isRunItemFinished({ ...ticked, isCompleted: false })).toBe(false);
  });

  it("keeps the server's form refusal, with its code, and the answers already saved", async () => {
    const run = runWith(formTask({}, { 'field-name': 'Acme' }));
    const refusal = new ApiError({ status: 409, code: FORM_INCOMPLETE_CODE, message: "A task's form has a required field without an answer." });
    const updateRun = vi.fn(async () => {
      throw refusal;
    });
    const saveRun = createRunSaver();

    const result = await saveRun(
      bindRunSaves({ dependencies: { updateRun }, noteDrafts: () => ({}) }).toggleItem('item-form', true),
      { apply: (applied) => applied, latest: () => run, onNotFound: vi.fn(), reload: vi.fn() },
    );

    expect(result).toEqual({ kind: 'error', code: FORM_INCOMPLETE_CODE, message: refusal.message });
    expect(fieldsOf(run)[0]?.answer).toBe('Acme');
  });
});
