import { describe, expect, it } from 'vitest';

import { canFinishRun } from '@/features/run-execution/primaryTaskAction';
import { mapChecklistToRun } from '@/features/run-execution/runExecutionMappers';
import { parseStoredSections } from '@functions/api/handlers/agentMcpRuns';
import { findOpenRunTasks } from '@functions/api/utils/template-reconciliation';

const subTasks = (...flags: Array<Record<string, unknown>>) => [{
  type: 'subItems',
  value: '',
  subItems: flags.map((state, index) => ({ id: `sub-${index + 1}`, title: `Sub ${index + 1}`, ...state })),
}];
const section = (...items: Array<Record<string, unknown>>) => ({ id: 'section-1', title: 'Release', items });
const task = (id: string, state: Record<string, unknown>) => ({ id, title: id, ...state });

const cases: Array<[string, unknown[], boolean]> = [
  ['every task done', [section(task('a', { isCompleted: true }), task('b', { isCompleted: true }))], true],
  ['an open task', [section(task('a', { isCompleted: true }), task('b', { isCompleted: false }))], false],
  ['a task with no completion yet', [section(task('a', {}))], false],
  ['a ticked task with an open Sub-task', [section(task('a', { isCompleted: true, contents: subTasks({ isCompleted: true }, { isCompleted: false }) }))], false],
  ['an unticked task whose Sub-tasks are done', [section(task('a', { isCompleted: false, contents: subTasks({ isCompleted: true }) }))], false],
  ['every task and Sub-task done', [section(task('a', { isCompleted: true, contents: subTasks({ isCompleted: true }, { isCompleted: true }) }))], true],
  ['legacy completed keys', [section(task('a', { completed: true, contents: subTasks({ completed: true }) }))], true],
  ['a legacy open Sub-task', [section(task('a', { completed: true, contents: subTasks({ completed: false }) }))], false],
  ['an open sub-item on a text block, which the run page never shows', [section(task('a', { isCompleted: true, contents: [{ type: 'text', value: 'Steps', subItems: [{ id: 'x', title: 'X', isCompleted: false }] }] }))], true],
  ['an open sub-item on the task itself, which the run page never shows', [section(task('a', { isCompleted: true, subItems: [{ id: 'x', title: 'X', isCompleted: false }] }))], true],
  ['open work in a later section', [section(task('a', { isCompleted: true })), { id: 'section-2', title: 'QA', items: [task('b', { isCompleted: false })] }], false],
  ['no tasks', [section()], false],
  ['no sections', [], false],
];

describe('the rule for completing a run, shared by Complete run and MCP set_run_status so neither completes work the other counts as open', () => {
  it.each(cases)('is the same on the run page and over MCP for %s', (_label, sections, expected) => {
    const items = JSON.stringify(sections);
    const run = mapChecklistToRun({ id: 'run-1', status: 'in_progress', items }, 'run-1');
    const { total, open } = findOpenRunTasks(parseStoredSections(items));

    expect(canFinishRun(run)).toBe(expected);
    expect(total > 0 && open.length === 0).toBe(expected);
  });
});
