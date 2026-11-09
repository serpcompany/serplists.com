import { describe, expect, it } from 'vitest';

import { withStableTemplateIdentities } from '@functions/api/utils/template-identities';
import { assignMissingStableTemplateIdentities } from '@functions/api/utils/template-reconciliation';
import { sectionRecordsIn, taskRecordsIn } from '@/lib/schemas/jsonRecords';

type JsonRecord = Record<string, unknown>;

function growingOnEachRead<Entry>(entries: Entry[]): () => Entry[] {
  let reads = 0;
  return () => {
    reads += 1;
    return entries.slice(0, reads);
  };
}

function sectionWhoseTasksGrowOnEachRead(titles: string[]): JsonRecord {
  const tasks = growingOnEachRead(titles.map((title) => ({ title })));
  return {
    id: 'prepare',
    title: 'Prepare',
    get items() {
      return tasks();
    },
  };
}

const idsOfTheTasks = (sections: unknown[]) =>
  taskRecordsIn(sectionRecordsIn(sections)[0]?.items).map((task) => task.id);

describe('stable ids for a previous version whose task list changes while it is read', () => {
  const previous = () => [sectionWhoseTasksGrowOnEachRead(['Old 1', 'Old 2', 'Old 3', 'Old 4'])];

  it('gives a task matched by title to a previous task that had no id yet the id of its own place', () => {
    const current = [{ id: 'prepare', title: 'Prepare', items: [{ title: 'Old 3' }] }];

    expect(idsOfTheTasks(assignMissingStableTemplateIdentities(current, previous()))).toEqual(['legacy-item-1-1']);
  });

  it('gives a task in the place of a previous task that had no id yet the id of its place', () => {
    const current = [{ id: 'prepare', title: 'Prepare', items: [{ title: 'New 1' }, { title: 'New 2' }, { title: 'New 3' }] }];

    expect(idsOfTheTasks(assignMissingStableTemplateIdentities(current, previous()))).toEqual([
      'legacy-item-1-1',
      'legacy-item-1-2',
      'legacy-item-1-3',
    ]);
  });
});

describe('stable ids for a list that changes while ids are assigned', () => {
  it('refuses, naming the position, when a section holds more tasks than ids were assigned for', () => {
    const sections = [sectionWhoseTasksGrowOnEachRead(['Pack', 'Load', 'Drive', 'Unload', 'Return', 'Park', 'Lock', 'Leave'])];

    expect(() => withStableTemplateIdentities(sections)).toThrow(/^Assigning stable ids returned no item at position \d+$/);
  });

  it('refuses, naming the sub-task, when a task holds more sub-tasks than ids were matched for', () => {
    const subTasks = growingOnEachRead([{ title: 'Tent' }, { title: 'Stove' }, { title: 'Lamp' }, { title: 'Rope' }]);
    const task = {
      title: 'Pack',
      get contents() {
        return [{ type: 'subItems', value: '', subItems: subTasks() }];
      },
    };

    expect(() => assignMissingStableTemplateIdentities([{ id: 'prepare', title: 'Prepare', items: [task] }]))
      .toThrow(/^No id was matched for sub-item \d+$/);
  });
});
