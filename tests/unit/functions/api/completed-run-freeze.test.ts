import { describe, expect, it } from 'vitest';
import { completedRunTaskChangeResponse } from '@functions/api/utils/completed-run-freeze';

type Task = Record<string, unknown>;

const section = (...items: unknown[]) => ({ id: 's1', title: 'Launch', items });
const task = (fields: Task = {}): Task => ({ title: 'Ship it', isCompleted: false, ...fields });
const subTasks = (...subItems: unknown[]) => ({ id: 'c1', type: 'subItems', value: '', subItems });
const form = (...fields: unknown[]) => ({ id: 'c2', type: 'form', value: '', fields });
const field = (answer: unknown, id?: string) => ({ ...(id === undefined ? {} : { id }), label: 'Client', kind: 'text', required: false, answer });

const refusal = (stored: unknown[], next: unknown[]) => completedRunTaskChangeResponse({ status: 'completed' }, undefined, stored, next);

describe('completedRunTaskChangeResponse', () => {
  it('leaves runs that are not completed, or that the save reopens, to the other checks', () => {
    const stored = [section(task({ id: 't1', isCompleted: true }))];
    const unticked = [section(task({ id: 't1' }))];

    expect(completedRunTaskChangeResponse({ status: 'in_progress' }, undefined, stored, unticked)).toBeNull();
    expect(completedRunTaskChangeResponse({ status: 'completed' }, 'in_progress', stored, unticked)).toBeNull();
  });

  it('refuses unticking the second of two tasks stored with the same id', async () => {
    const stored = [section(task({ id: 'dup', isCompleted: true }), task({ id: 'dup', isCompleted: true }))];
    const response = refusal(stored, [section(task({ id: 'dup', isCompleted: true }), task({ id: 'dup' }))]);

    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ code: 'run_completed' });
  });

  it('matches tasks stored without an id by their place in the run', () => {
    const stored = [section(task({ isCompleted: true }), task())];

    expect(refusal(stored, [section(task({ isCompleted: true }), task())])).toBeNull();
    expect(refusal(stored, [section(task(), task())])?.status).toBe(409);
  });

  it('reads a Sub-task stored as plain text as open and a legacy completed flag as done', () => {
    const stored = [section(task({ id: 't1', contents: [subTasks('Draft copy', '  ', { id: 'st2', completed: true })] }))];

    expect(refusal(stored, [section(task({ id: 't1', contents: [subTasks('Draft copy', { id: 'st2', isCompleted: true })] }))])).toBeNull();
    expect(refusal(stored, [section(task({ id: 't1', contents: [subTasks({ isCompleted: true }, { id: 'st2', isCompleted: true })] }))])?.status).toBe(409);
  });

  it('treats clearing a form answer as a change, but not rewriting an empty one', () => {
    const stored = [section(task({ id: 't1', contents: [form(field('Acme', 'client'), field(''))] }))];

    expect(refusal(stored, [section(task({ id: 't1', contents: [form(field('Acme', 'client'), field('   '))] }))])).toBeNull();
    expect(refusal(stored, [section(task({ id: 't1', contents: [form(field(''), field('', 'client'))] }))])?.status).toBe(409);
  });

  it('ignores sections and tasks that are not records, and a task list that is not a list', () => {
    const stored = [section(task({ id: 't1', isCompleted: true }))];

    expect(refusal(stored, ['not a section', { id: 's2', title: 'Odd', items: 'none' }, section('not a task', task({ id: 't1', isCompleted: true }))])).toBeNull();
  });
});
