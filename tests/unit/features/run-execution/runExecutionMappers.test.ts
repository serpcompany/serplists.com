import { describe, expect, it } from 'vitest';

import {
  areAllRunItemsCompleted,
  countRunExecutionItems,
  getNextSelectedItemId,
  mapChecklistRuns,
  mapChecklistToRun,
} from '@/features/run-execution/runExecutionMappers';
import type { ChecklistRun } from '@/types/checklist';

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
          subItems: [{ id: 'qa-sub', title: 'Card payment', isCompleted: true }],
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

  it('reads Sub-tasks from subItems content blocks too', () => {
    const item = {
      id: 'copy-2',
      title: 'Write more copy',
      contents: [{ type: 'subItems', value: '', subItems: [{ id: 'short', title: 'Short', isCompleted: true }] }],
    };
    const [entry] = mapChecklistToRun(checklist([{ kind: 'item', sectionId: 's1', item }]), 'run-1').retiredItems ?? [];

    expect(entry).toEqual(expect.objectContaining({
      task: expect.objectContaining({ subTasks: [{ id: 'short', title: 'Short', isCompleted: true }] }),
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
    expect(items[0]).toEqual(expect.objectContaining({ task: expect.objectContaining({ notes: 'Second' }) }));
  });

  it('never counts retired work toward progress, completion or the next task', () => {
    const run = mapChecklistToRun(checklist(retired), 'run-1');

    expect(run.progress).toBe(0);
    expect(countRunExecutionItems(run)).toEqual({ completed: 0, progress: 0, total: 1 });
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

    expect(run.sections[0].items[0].contents).toEqual([{ type: 'subItems', value: '', subItems: [] }]);
    expect(run.progress).toBe(0);
  });

  it('keeps every run listed when one run holds malformed content', () => {
    const runs = mapChecklistRuns([malformed, valid]);

    expect(runs.map((run) => run.id)).toEqual(['run-bad', 'run-ok']);
    expect(runs[0]).toEqual(expect.objectContaining({ teamId: 'org-1', progress: 0 }));
    expect(runs[1]).toEqual(expect.objectContaining({ progress: 100 }));
  });

  it('keeps a run whose items column is not even JSON, with no tasks, so it can still be deleted', () => {
    const runs = mapChecklistRuns([{ id: 'run-broken', title: 'Broken', items: '{not json' }, valid, 'x']);

    expect(runs.map((run) => run.id)).toEqual(['run-broken', 'run-ok']);
    expect(runs[0]).toEqual(expect.objectContaining({ sections: [], progress: 0 }));
  });
});
