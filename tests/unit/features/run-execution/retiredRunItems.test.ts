import { describe, expect, it } from 'vitest';

import { parseRetiredRunItems } from '@/features/run-execution/retiredRunItems';

describe('retired work stored before tasks and Sub-tasks always had text ids', () => {
  it('numbers a task or Sub-task without one by its place, so the run page can still list it', () => {
    const removedSection = {
      kind: 'section',
      section: {
        id: 's9',
        title: 'Old launch steps',
        items: [{
          title: 'Book the venue',
          contents: [{ type: 'subItems', value: '', subItems: [{ title: 'Call the hall' }, { id: 7, title: 'Pay the deposit', isCompleted: true }] }],
        }],
      },
    };

    expect(parseRetiredRunItems([removedSection])).toEqual([{
      kind: 'section',
      id: 's9',
      title: 'Old launch steps',
      tasks: [{
        id: '1',
        title: 'Book the venue',
        isCompleted: false,
        subTasks: [
          { id: '1', title: 'Call the hall', isCompleted: false },
          { id: '2', title: 'Pay the deposit', isCompleted: true },
        ],
      }],
    }]);
  });

  it('reads a column holding one JSON object, not a list, as no retired work', () => {
    expect(parseRetiredRunItems('{"kind":"item"}')).toEqual([]);
  });
});
