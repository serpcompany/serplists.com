import { describe, expect, it } from 'vitest';

import {
  calculateRunProgress,
  findNonObjectTemplateEntry,
  findOpenRunTasks,
  reconcileRunSections,
  resetRunCompletionState,
  summarizeRetiredEntries,
} from '@functions/api/utils/template-reconciliation';
import { getTaskFormFields } from '@/lib/schemas/storedSections';
import { sectionRecordsIn, taskRecordsIn } from '@/lib/schemas/jsonRecords';
import { objectContaining } from '../../../support/asymmetricMatchers';
import { firstOf } from '../../../support/elements';

type JsonRecord = Record<string, unknown>;

const field = (id: string, extra: JsonRecord = {}) => ({ id, label: `Field ${id}`, kind: 'text', required: false, ...extra });
const formTask = (id: string, fields: JsonRecord[], extra: JsonRecord = {}) => ({
  id,
  title: `Task ${id}`,
  contents: [{ id: `${id}-form`, type: 'form', value: '', fields }],
  ...extra,
});
const sections = (...tasks: JsonRecord[]) => [{ id: 's1', title: 'Kickoff', items: tasks }];

const tasksOf = (result: { sections: unknown[] }) => taskRecordsIn(firstOf(sectionRecordsIn(result.sections)).items);
const taskOf = (result: { sections: unknown[] }, index = 0) => {
  const task = tasksOf(result)[index];
  if (!task) throw new Error(`No task at ${index}`);
  return task;
};
const answersOf = (result: { sections: unknown[] }, index = 0) =>
  Object.fromEntries(getTaskFormFields(taskOf(result, index)).map((entry): [string, unknown] => [String(entry.id), entry.answer]));

describe('reconciling a run with its Template carries form answers by field id', () => {
  it('keeps answers while the kind is unchanged, through a new label, order or required flag', () => {
    const previous = sections(formTask('t1', [field('a', { answer: 'Acme' }), field('b', { kind: 'number', answer: 3 })], { isCompleted: true }));
    const template = sections(formTask('t1', [field('b', { kind: 'number', label: 'Seats', required: true }), field('a', { label: 'Client' })]));

    const result = reconcileRunSections(previous, template, []);

    expect(answersOf(result)).toEqual({ a: 'Acme', b: 3 });
    expect(taskOf(result).isCompleted).toBe(true);
    expect(result.newlyRetired).toEqual([]);
  });

  it('keeps the answer of a field the Template moved to another task', () => {
    const previous = sections(formTask('t1', [field('a', { answer: 'Acme' })]), formTask('t2', []));
    const template = sections(formTask('t1', []), formTask('t2', [field('a')]));

    const result = reconcileRunSections(previous, template, []);

    expect(answersOf(result, 1)).toEqual({ a: 'Acme' });
    expect(result.newlyRetired).toEqual([]);
  });

  it('starts a field whose kind changed empty and retires its old answer', () => {
    const previous = sections(formTask('t1', [field('a', { answer: 'forty' })]));
    const template = sections(formTask('t1', [field('a', { kind: 'number' })]));

    const result = reconcileRunSections(previous, template, []);

    expect(answersOf(result)).toEqual({ a: undefined });
    expect(result.newlyRetired).toEqual([{
      kind: 'formAnswer',
      sectionId: 's1',
      itemId: 't1',
      itemTitle: 'Task t1',
      field: field('a', { answer: 'forty' }),
    }]);
  });

  it('retires the answer of a removed field, and nothing for a removed field nobody answered', () => {
    const previous = sections(formTask('t1', [field('a', { answer: 'Acme' }), field('b'), field('c', { answer: false, kind: 'checkbox' })]));
    const template = sections(formTask('t1', []));

    const result = reconcileRunSections(previous, template, []);

    expect(result.newlyRetired).toEqual([objectContaining({ kind: 'formAnswer', itemId: 't1', field: field('a', { answer: 'Acme' }) })]);
    expect(summarizeRetiredEntries(result.newlyRetired)).toEqual([{ kind: 'formAnswer', id: 'a', title: 'Field a' }]);
  });

  it('restores a retired answer when its field comes back, and takes it out of the retired work', () => {
    const previous = sections(formTask('t1', [field('a', { answer: 'Acme' })]));
    const removed = reconcileRunSections(previous, sections(formTask('t1', [])), []);
    const restored = reconcileRunSections(removed.sections, sections(formTask('t1', [field('a')])), removed.retired);

    expect(answersOf(restored)).toEqual({ a: 'Acme' });
    expect(restored.retired).toEqual([]);
  });

  it('never copies an answer the Template holds into the run', () => {
    const result = reconcileRunSections(sections(formTask('t1', [field('a')])), sections(formTask('t1', [field('a', { answer: 'leaked' })])), []);

    expect(answersOf(result)).toEqual({ a: undefined });
  });
});

describe('reconciling a done task whose form now blocks it', () => {
  it('reopens it when the Template adds a required field, and keeps it done for an optional one', () => {
    const previous = sections(formTask('t1', [], { isCompleted: true }), formTask('t2', [], { isCompleted: true }));
    const template = sections(formTask('t1', [field('new', { required: true })]), formTask('t2', [field('optional')]));

    const result = reconcileRunSections(previous, template, []);

    expect(tasksOf(result).map((task) => task.isCompleted)).toEqual([false, true]);
  });

  it('does not complete a task whose Sub-tasks are all done while its form blocks it', () => {
    const subTasks = { id: 'c-sub', type: 'subItems', value: '', subItems: [{ id: 'sub', title: 'One', isCompleted: true }] };
    const previous = sections({ id: 't1', title: 'Task', isCompleted: true, contents: [subTasks] });
    const template = sections({ id: 't1', title: 'Task', contents: [{ ...subTasks, subItems: [{ id: 'sub', title: 'One' }] }, {
      id: 'c-form', type: 'form', value: '', fields: [field('a', { required: true })],
    }] });

    expect(taskOf(reconcileRunSections(previous, template, [])).isCompleted).toBe(false);
  });
});

describe('form answers in other run state', () => {
  it('keeps the answers of a removed task in its retired copy, without a field the Template moved elsewhere', () => {
    const previous = sections(formTask('t1', [field('a', { answer: 'Acme' }), field('b', { answer: 'Kept' })]), formTask('t2', []));
    const template = sections(formTask('t2', [field('a')]));

    const result = reconcileRunSections(previous, template, []);

    expect(answersOf(result)).toEqual({ a: 'Acme' });
    expect(result.newlyRetired).toEqual([objectContaining({
      kind: 'item',
      item: objectContaining({ contents: [objectContaining({ fields: [field('b', { answer: 'Kept' })] })] }),
    })]);
  });

  it('clears answers when a run starts, and does not count fields toward progress or open tasks', () => {
    const run = sections(formTask('t1', [field('a', { required: true, answer: 'Acme' })], { isCompleted: true }));

    expect(getTaskFormFields(firstOf(taskRecordsIn(firstOf(sectionRecordsIn(resetRunCompletionState(run))).items)))).toEqual([
      field('a', { required: true }),
    ]);
    expect(calculateRunProgress(run)).toBe(100);
    expect(findOpenRunTasks(run)).toEqual({ total: 1, open: [] });
  });
});

describe('a Template import with a form field that is not an object', () => {
  it('names the field and its task', () => {
    expect(findNonObjectTemplateEntry(sections(formTask('t1', [field('a')]), { id: 't2', title: 'T', contents: [{ type: 'form', fields: [field('b'), 'x'] }] })))
      .toBe('Form field 2 of task 2 in section 1 must be an object with a label and a kind');
  });
});
