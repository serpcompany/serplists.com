import { describe, expect, it } from 'vitest';
import { sectionAt, taskAt } from '../../../support/elements';

import { calculateRunProgress } from '@functions/api/utils/template-reconciliation';
import {
  areAllRunItemsCompleted,
  areItemSubItemsCompleted,
  countRunExecutionItems,
  getInitialSelectedItemId,
  getNextSelectedItemId,
  getSelectionAfterToggle,
  mapChecklistRuns,
  mapChecklistToRun,
} from '@/features/run-execution/runExecutionMappers';
import { serializeSharedChecklistRun } from '@functions/api/utils/checklist-runs';
import { apiRunSchema } from '@/lib/schemas/apiRuns';
import type { ChecklistItem, ChecklistRun } from '@/types/checklist';
import { objectContaining } from '../../../support/asymmetricMatchers';

const run = (completed: string[]): ChecklistRun =>
  ({
    id: 'run-1',
    sections: [
      { id: 's1', title: 'One', items: ['a', 'b'].map((id) => ({ id, title: id, isCompleted: completed.includes(id) })) },
      { id: 's2', title: 'Two', items: ['c', 'd'].map((id) => ({ id, title: id, isCompleted: completed.includes(id) })) },
    ],
  }) as unknown as ChecklistRun;

describe('getNextSelectedItemId', () => {
  it('moves to the next unfinished task, across sections', () => {
    expect(getNextSelectedItemId(run(['a']), 'a')).toBe('b');
    expect(getNextSelectedItemId(run(['a', 'b']), 'b')).toBe('c');
  });

  it('skips finished tasks and wraps to earlier unfinished ones', () => {
    expect(getNextSelectedItemId(run(['a', 'c', 'd']), 'c')).toBe('b');
    expect(getNextSelectedItemId(run(['b', 'c', 'd']), 'd')).toBe('a');
  });

  it('stays on the task when every task is done', () => {
    expect(getNextSelectedItemId(run(['a', 'b', 'c', 'd']), 'd')).toBe('d');
  });
});

describe('a ticked task with an open Sub-task, which older runs and API writes can hold, is not done', () => {
  const withOpenSubTask = (): ChecklistRun => {
    const legacy = run(['a', 'b', 'c', 'd']);
    taskAt(legacy, 0, 1).contents = [
      { type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Done', isCompleted: true }] },
      { type: 'subItems', value: '', subItems: [{ id: 'sub-2', title: 'Open', isCompleted: false }] },
    ];
    return legacy;
  };

  it('is where the run opens', () => {
    expect(getInitialSelectedItemId(withOpenSubTask())).toBe('b');
  });

  it('is the next unfinished task, also wrapping from a later task', () => {
    expect(getNextSelectedItemId(withOpenSubTask(), 'a')).toBe('b');
    expect(getNextSelectedItemId(withOpenSubTask(), 'd')).toBe('b');
  });

  it('is not skipped for an empty Sub-tasks block on a ticked task', () => {
    const done = run(['a', 'b', 'c', 'd']);
    taskAt(done, 0, 1).contents = [{ type: 'subItems', value: '', subItems: [] }];

    expect(getNextSelectedItemId(done, 'd')).toBe('d');
    expect(getInitialSelectedItemId(done)).toBe('a');
  });
});

describe('getSelectionAfterToggle, the auto-advance that runs when a save lands and sees the task the user moved to meanwhile', () => {
  it('moves on from a completed task that is still selected', () => {
    expect(getSelectionAfterToggle(run(['a']), 'a', 'a')).toBe('b');
    expect(getSelectionAfterToggle(run(['a', 'c', 'd']), 'c', 'c')).toBe('b');
  });

  it('keeps the task the user picked in the Progress panel, or with Previous, while the save was in flight', () => {
    expect(getSelectionAfterToggle(run(['a']), 'a', 'd')).toBe('d');
    expect(getSelectionAfterToggle(run(['c']), 'c', 'b')).toBe('b');
  });

  it('never moves back to an earlier task when the saves of A and B land after the user completed both and went Next to C', () => {
    const afterSaveOfA = getSelectionAfterToggle(run(['a']), 'a', 'c');
    expect(afterSaveOfA).toBe('c');
    expect(getSelectionAfterToggle(run(['a', 'b']), 'b', afterSaveOfA)).toBe('c');
  });

  it('moves on when the user came back to the completed task before the save landed', () => {
    expect(getSelectionAfterToggle(run(['a']), 'a', 'a')).toBe('b');
  });

  it('does not move after an untick', () => {
    expect(getSelectionAfterToggle(run([]), 'a', 'a')).toBe('a');
    expect(getSelectionAfterToggle(run([]), 'a', 'c')).toBe('c');
  });

  it('stays on the task when every task is done, so the completion prompt shows over it', () => {
    expect(getSelectionAfterToggle(run(['a', 'b', 'c', 'd']), 'd', 'd')).toBe('d');
  });

  it('leaves the selection alone when the toggled task is no longer in the run', () => {
    expect(getSelectionAfterToggle(run(['a']), 'gone', 'a')).toBe('a');
    expect(getSelectionAfterToggle(run(['a']), 'a', null)).toBeNull();
  });
});

describe('mapChecklistToRun', () => {
  it('keeps the Organization that owns the run, so the page can check the member role', () => {
    expect(mapChecklistToRun({ id: 'run-1', team_id: 'team-1', items: '[]' }, 'run-1').teamId).toBe('team-1');
    expect(mapChecklistToRun({ id: 'run-2', team_id: null, items: '[]' }, 'run-2').teamId).toBeUndefined();
  });
});


describe('areItemSubItemsCompleted', () => {
  const item = (contents: ChecklistItem['contents']): ChecklistItem => ({ id: 'task', title: 'Task', contents });
  const block = (...done: (boolean | undefined)[]) => ({
    type: 'subItems' as const,
    value: '',
    subItems: done.map((isCompleted, index) => ({ id: `s${index}`, title: `S${index}`, isCompleted })),
  });

  it('is false for a task with no sub-tasks at all', () => {
    expect(areItemSubItemsCompleted(item(undefined))).toBe(false);
    expect(areItemSubItemsCompleted(item([]))).toBe(false);
    expect(areItemSubItemsCompleted(item([{ type: 'text', value: 'hi' }]))).toBe(false);
    expect(areItemSubItemsCompleted(item([block(), { type: 'subItems', value: '' }]))).toBe(false);
  });

  it('counts the sub-tasks of every block, not just one', () => {
    expect(areItemSubItemsCompleted(item([block(false, false), block(true)]))).toBe(false);
    expect(areItemSubItemsCompleted(item([block(true, false), block(true)]))).toBe(false);
    expect(areItemSubItemsCompleted(item([block(true, true), block(true)]))).toBe(true);
  });

  it('ignores empty blocks and other content next to ticked ones', () => {
    expect(
      areItemSubItemsCompleted(item([block(true), { type: 'text', value: 'x' }, block(), { type: 'subItems', value: '' }])),
    ).toBe(true);
  });

  it('treats a sub-task with no completion flag as open', () => {
    expect(areItemSubItemsCompleted(item([block(true, undefined)]))).toBe(false);
  });
});

describe('countRunExecutionItems, which counts top-level tasks as the task list and the runs list do, and Sub-tasks apart, while progress weights both like the API', () => {
  const task = (id: string, subTasks: boolean[], isCompleted = false): ChecklistItem => ({
    id,
    title: id,
    isCompleted,
    contents: [
      {
        type: 'subItems',
        value: '',
        subItems: subTasks.map((done, index) => ({ id: `${id}-${index}`, title: `${id} ${index}`, isCompleted: done })),
      },
    ],
  });
  const runOf = (...items: ChecklistItem[]): ChecklistRun =>
    ({ id: 'run-1', sections: [{ id: 's1', title: 'One', items }] }) as unknown as ChecklistRun;

  it('counts tasks and sub-tasks separately', () => {
    const counts = countRunExecutionItems(runOf(task('a', [false, false, false]), task('b', [false, false, false]), task('c', [false, false, false])));
    expect(counts).toEqual({ progress: 0, subTasksCompleted: 0, subTasksTotal: 9, tasksCompleted: 0, tasksTotal: 3 });
  });

  it('does not count a ticked sub-task as a finished task', () => {
    const counts = countRunExecutionItems(runOf(task('a', [true, false, false]), task('b', [false, false, false]), task('c', [false, false, false])));
    expect(counts).toMatchObject({ subTasksCompleted: 1, tasksCompleted: 0, tasksTotal: 3 });
    expect(counts.progress).toBe(8);
  });

  it('sums every Sub-tasks block of a task and skips other content', () => {
    const item: ChecklistItem = {
      id: 'a',
      title: 'a',
      isCompleted: false,
      contents: [
        { type: 'text', value: 'Read me' },
        { type: 'subItems', value: '', subItems: [{ id: 'a-1', title: 'one', isCompleted: true }] },
        { type: 'subItems', value: '' },
        { type: 'subItems', value: '', subItems: [{ id: 'a-2', title: 'two', isCompleted: false }] },
      ],
    };
    expect(countRunExecutionItems(runOf(item, { id: 'b', title: 'b', isCompleted: true }))).toEqual({
      progress: 50,
      subTasksCompleted: 1,
      subTasksTotal: 2,
      tasksCompleted: 1,
      tasksTotal: 2,
    });
  });

  it('returns zeros for no run or a run with no tasks', () => {
    const zero = { progress: 0, subTasksCompleted: 0, subTasksTotal: 0, tasksCompleted: 0, tasksTotal: 0 };
    expect(countRunExecutionItems(null)).toEqual(zero);
    expect(countRunExecutionItems(runOf())).toEqual(zero);
    expect(countRunExecutionItems({ id: 'run-1', sections: [] } as unknown as ChecklistRun)).toEqual(zero);
  });

  it('weights progress the same way as the API that stores it', () => {
    const patterns: ChecklistItem[][] = [
      [task('a', [true, false, false]), task('b', [false, false, false]), task('c', [false, false, false])],
      [task('a', [true, true, true], true), task('b', [true, false]), { id: 'c', title: 'c', isCompleted: true }],
      [task('a', [false], true), { id: 'b', title: 'b', isCompleted: false }],
      [{ id: 'a', title: 'a', isCompleted: true }],
    ];
    for (const items of patterns) {
      const run = runOf(...items);
      expect(countRunExecutionItems(run).progress).toBe(calculateRunProgress(run.sections));
    }
  });
});

describe('areAllRunItemsCompleted', () => {
  const withSubTask = (subTaskDone: boolean): ChecklistRun =>
    ({
      id: 'run-1',
      sections: [{
        id: 's1',
        title: 'One',
        items: [{
          id: 'a',
          title: 'a',
          isCompleted: true,
          contents: [{ id: 'c1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Tagline', isCompleted: subTaskDone }] }],
        }],
      }],
    }) as unknown as ChecklistRun;

  it('is false while a ticked task still has an unfinished Sub-task', () => {
    expect(areAllRunItemsCompleted(withSubTask(false))).toBe(false);
    expect(areAllRunItemsCompleted(withSubTask(true))).toBe(true);
  });
});

describe('mapChecklistToRun retired work', () => {
  const sections = [{ id: 's1', title: 'Launch', items: [{ id: 'copy', title: 'Write copy', isCompleted: false }] }];
  const retired = [
    {
      kind: 'section',
      section: {
        id: 's2',
        title: 'QA',
        items: [{
          id: 'qa',
          title: 'Test checkout',
          isCompleted: true,
          notes: 'Passed on staging',
          contents: [{ type: 'subItems', value: '', subItems: [{ id: 'qa-sub', title: 'Card payment', isCompleted: true }] }],
        }],
      },
    },
    { kind: 'item', sectionId: 's1', sectionTitle: 'Launch', item: { id: 'dns', title: 'Check DNS', completed: true, notes: 'TTL lowered to 300' } },
    {
      kind: 'subItem',
      sectionId: 's1',
      itemId: 'copy',
      itemTitle: 'Write copy',
      subItem: { id: 'tagline', title: 'Tagline', isCompleted: false },
    },
  ];
  const checklist = (retiredItems: unknown) => ({ id: 'run-1', items: JSON.stringify(sections), retired_items: retiredItems });

  it('exposes all three retired kinds with their completion and notes, from a JSON string or an array', () => {
    for (const value of [JSON.stringify(retired), retired]) {
      expect(mapChecklistToRun(checklist(value), 'run-1').retiredItems).toEqual([
        {
          kind: 'section',
          id: 's2',
          title: 'QA',
          tasks: [{
            id: 'qa',
            title: 'Test checkout',
            isCompleted: true,
            notes: 'Passed on staging',
            subTasks: [{ id: 'qa-sub', title: 'Card payment', isCompleted: true }],
          }],
        },
        {
          kind: 'item',
          id: 'dns',
          sectionTitle: 'Launch',
          task: { id: 'dns', title: 'Check DNS', isCompleted: true, notes: 'TTL lowered to 300', subTasks: [] },
        },
        { kind: 'subItem', id: 'tagline', itemTitle: 'Write copy', subTask: { id: 'tagline', title: 'Tagline', isCompleted: false } },
      ]);
    }
  });

  it('reads Sub-tasks only from Sub-tasks blocks, the ones the run page showed', () => {
    const item = {
      id: 'copy-2',
      title: 'Write more copy',
      subItems: [{ id: 'direct', title: 'Never shown', isCompleted: false }],
      contents: [
        { type: 'text', value: 'Steps', subItems: [{ id: 'on-text', title: 'Never shown', isCompleted: false }] },
        { type: 'subItems', value: '', subItems: [{ id: 'short', title: 'Short', isCompleted: true }] },
      ],
    };
    const [entry] = mapChecklistToRun(checklist([{ kind: 'item', sectionId: 's1', item }]), 'run-1').retiredItems ?? [];

    expect(entry).toEqual(objectContaining({
      task: objectContaining({ subTasks: [{ id: 'short', title: 'Short', isCompleted: true }] }),
    }));
  });

  it('drops malformed entries and tolerates a missing or broken column', () => {
    const garbage = [null, 'x', { kind: 'unknown', item: { id: 'a' } }, { kind: 'item', item: 'x' }, { kind: 'item', item: { title: 'no id' } }];

    expect(mapChecklistToRun(checklist(garbage), 'run-1').retiredItems).toEqual([]);
    expect(mapChecklistToRun(checklist('{not json'), 'run-1').retiredItems).toEqual([]);
    expect(mapChecklistToRun(checklist(undefined), 'run-1').retiredItems).toEqual([]);
    expect(mapChecklistToRun(checklist('[]'), 'run-1').retiredItems).toEqual([]);
  });

  it('keeps the latest entry when an id was retired twice', () => {
    const first = { kind: 'item', sectionId: 's1', item: { id: 'dns', title: 'Check DNS', notes: 'First' } };
    const second = { kind: 'item', sectionId: 's1', item: { id: 'dns', title: 'Check DNS', notes: 'Second' } };
    const items = mapChecklistToRun(checklist([first, second]), 'run-1').retiredItems ?? [];

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(objectContaining({ task: objectContaining({ notes: 'Second' }) }));
  });

  it('never counts retired work toward progress, completion or the next task', () => {
    const run = mapChecklistToRun(checklist(retired), 'run-1');

    expect(run.progress).toBe(0);
    expect(countRunExecutionItems(run)).toEqual({ progress: 0, subTasksCompleted: 0, subTasksTotal: 0, tasksCompleted: 0, tasksTotal: 1 });
    expect(areAllRunItemsCompleted(run)).toBe(false);
    expect(getNextSelectedItemId(run, 'copy')).toBe('copy');
  });
});

describe('mapChecklistRuns', () => {
  const valid = { id: 'run-ok', title: 'Launch', items: JSON.stringify([{ id: 's1', title: 'S', items: [{ id: 'a', title: 'A', isCompleted: true }] }]) };
  const malformed = {
    id: 'run-bad',
    title: 'Revalidated',
    team_id: 'org-1',
    items: JSON.stringify([{ id: 's1', title: 'S', items: [{ id: 'b', title: 'B', contents: [{ type: 'subItems', value: '', subItems: 'x' }] }] }]),
  };

  it('maps a run with malformed content instead of throwing (the run page showed "Unable to load run")', () => {
    const run = mapChecklistToRun(malformed, 'run-bad');

    expect(taskAt(run, 0, 0).contents).toEqual([{ type: 'subItems', value: '', subItems: [] }]);
    expect(run.progress).toBe(0);
  });

  it('keeps every run listed when one run holds malformed content', () => {
    const runs = mapChecklistRuns([malformed, valid]);

    expect(runs.map((run) => run.id)).toEqual(['run-bad', 'run-ok']);
    expect(runs[0]).toEqual(objectContaining({ teamId: 'org-1', progress: 0 }));
    expect(runs[1]).toEqual(objectContaining({ progress: 100 }));
  });

  it('keeps a run whose items column is not even JSON, with no tasks, so it can still be deleted', () => {
    const runs = mapChecklistRuns([{ id: 'run-broken', title: 'Broken', items: '{not json' }, valid]);

    expect(runs.map((run) => run.id)).toEqual(['run-broken', 'run-ok']);
    expect(runs[0]).toEqual(objectContaining({ sections: [], progress: 0 }));
  });
});

describe('mapChecklistToRun', () => {
  it('maps the share-link payload, which carries no owner or template ids', () => {
    const shared = serializeSharedChecklistRun({
      id: 'run-1',
      title: 'Shared Run',
      items: JSON.stringify([{ id: 's1', title: 'One', items: [{ id: 'a', title: 'A', isCompleted: true }, { id: 'b', title: 'B' }] }]),
      status: 'in_progress',
      progress: 50,
      started_at: '2026-01-01T00:00:00.000Z',
      completed_at: null,
      revision: 4,
      template_version: 2,
      current_template_version: 2,
    });

    const mapped = mapChecklistToRun(apiRunSchema.parse(shared), 'share-token');

    expect(mapped).toMatchObject({
      id: 'run-1',
      title: 'Shared Run',
      status: 'in_progress',
      progress: 50,
      startedAt: '2026-01-01T00:00:00.000Z',
      revision: 4,
      templateVersion: 2,
      isStale: false,
      userId: '',
      templateId: '',
    });
    expect(sectionAt(mapped, 0).items.map((item) => item.isCompleted)).toEqual([true, false]);
  });
});
