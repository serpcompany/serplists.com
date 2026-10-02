import { describe, expect, it } from 'vitest';

import { canFinishRun } from '@/features/run-execution/primaryTaskAction';
import { mapChecklistToRun } from '@/features/run-execution/runExecutionMappers';
import { sanitizeStoredSections } from '@/lib/schemas/storedSections';
import { countRunTasks } from '@/lib/utils/checklistSections';
import { applyRunOperation } from '@functions/api/handlers/agentMcpRuns';
import {
  calculateRunProgress,
  findOpenRunTasks,
  reconcileRunSections,
  validateStableTemplateIdentities,
} from '@functions/api/utils/template-reconciliation';

type Json = Record<string, any>;

const hidden = (isCompleted: boolean) => ({ id: 'hidden', title: 'Hidden', isCompleted });
const visible = (isCompleted: boolean) => ({ id: 'visible', title: 'Visible', isCompleted });
const task = (fields: Json) => ({ id: 'task-1', title: 'Write copy', ...fields });
const onText = (isCompleted: boolean) => ({ type: 'text', value: 'Steps', subItems: [hidden(isCompleted)] });
const onImage = (isCompleted: boolean) => ({ type: 'image', value: 'https://example.com/a.png', subItems: [hidden(isCompleted)] });
const subTasksBlock = (isCompleted: boolean) => ({ type: 'subItems', value: '', subItems: [visible(isCompleted)] });
const sectionsOf = (...items: Json[]) => [{ id: 'section-1', title: 'Launch', items }];

const fixtures: Array<[string, Json[]]> = [
  ['sub-items on a text block', sectionsOf(task({ isCompleted: true, contents: [onText(false), subTasksBlock(true)] }))],
  ['sub-items on an image block', sectionsOf(task({ isCompleted: true, contents: [onImage(false), subTasksBlock(true)] }))],
  ['sub-items on the task itself', sectionsOf(task({ isCompleted: true, subItems: [hidden(false)], contents: [subTasksBlock(true)] }))],
  ['only hidden sub-items', sectionsOf(task({ isCompleted: true, subItems: [hidden(false)], contents: [onText(false)] }))],
  ['an open Sub-task beside a done hidden one', sectionsOf(task({ isCompleted: true, contents: [onText(true), subTasksBlock(false)] }))],
];

describe('the Sub-tasks of a task, which are only the rows of its Sub-tasks blocks,', () => {
  it.each(fixtures)('are the same on the run page and in the API for %s', (_label, sections) => {
    const run = mapChecklistToRun({ id: 'run-1', status: 'in_progress', items: JSON.stringify(sections) }, 'run-1');
    const counts = countRunTasks(run.sections);
    const { total, open } = findOpenRunTasks(sections);

    expect(calculateRunProgress(sections)).toBe(run.progress);
    expect(total > 0 && open.length === 0).toBe(canFinishRun(run));
    expect(total).toBe(counts.tasksTotal);
  });

  it('lets an agent finish a task by ticking its last visible Sub-task', () => {
    const sections = sectionsOf(task({ isCompleted: false, subItems: [hidden(false)], contents: [onText(false), subTasksBlock(false)] }));

    applyRunOperation(sections, { runId: 'run-1', expectedRevision: 1, operation: 'set_subtask_completed', taskId: 'task-1', subtaskId: 'visible', completed: true });

    expect(sections[0].items[0].isCompleted).toBe(true);
    expect(findOpenRunTasks(sections).open).toEqual([]);
  });

  it('does not let an agent tick a sub-item the run page never shows', () => {
    const sections = sectionsOf(task({ isCompleted: false, contents: [onText(false), subTasksBlock(false)] }));

    expect(() => applyRunOperation(sections, {
      runId: 'run-1', expectedRevision: 1, operation: 'set_subtask_completed', taskId: 'task-1', subtaskId: 'hidden', completed: true,
    })).toThrow(expect.objectContaining({ code: 'subtask_not_found' }));
  });

  it('keeps a completed task complete when its Template is reconciled', () => {
    const template = sectionsOf({ id: 'task-1', title: 'Write copy', contents: [onText(false), subTasksBlock(false)] });
    const previous = sectionsOf(task({ isCompleted: true, contents: [onText(false), subTasksBlock(true)] }));

    const result = reconcileRunSections(previous, template, []);

    expect(result.sections[0].items[0].isCompleted).toBe(true);
    expect(result.newlyRetired).toEqual([]);
  });

  it('never retires a sub-item the run page never showed', () => {
    const previous = sectionsOf(task({ isCompleted: true, contents: [onText(false), subTasksBlock(true)] }));
    const template = sectionsOf({ id: 'task-1', title: 'Write copy', contents: [{ type: 'text', value: 'Steps' }, subTasksBlock(false)] });

    expect(reconcileRunSections(previous, template, []).newlyRetired).toEqual([]);
  });

  it('does not ask for ids on sub-items the run page never shows', () => {
    const sections = sectionsOf({ id: 'task-1', title: 'Write copy', contents: [{ type: 'text', value: 'Steps', subItems: [{ title: 'No id' }] }] });

    expect(validateStableTemplateIdentities(sections)).toBeNull();
  });

  it('are the only sub-items stored content keeps on a block', () => {
    const [section] = sanitizeStoredSections(sectionsOf(task({ contents: [onText(false), subTasksBlock(true)] })));

    expect(section.items).toEqual([expect.objectContaining({
      contents: [{ type: 'text', value: 'Steps' }, { type: 'subItems', value: '', subItems: [visible(true)] }],
    })]);
  });
});
