import { describe, expect, it } from 'vitest';

import { findStoredSectionsIssue } from '@/lib/schemas/storedSections';
import {
  calculateSectionsProgress,
  normalizeSections,
  resetSectionsCompletion,
} from '@/lib/utils/checklistSections';
import { hostileSections } from '../../../fixtures/malformedSections';

describe('normalizeSections on stored content', () => {
  it.each(hostileSections)('never throws on %s, and the result saves back without a 400', (_label, sections) => {
    const normalized = normalizeSections(sections);

    expect(() => calculateSectionsProgress(normalized)).not.toThrow();
    expect(() => resetSectionsCompletion(normalized)).not.toThrow();
    expect(findStoredSectionsIssue(normalized)).toBeNull();
  });

  it('turns a malformed Sub-task list into an empty one and a non-text value into empty text', () => {
    const [section] = normalizeSections([{
      id: 's1',
      title: 'Launch',
      items: [{ id: 'i1', title: 'Task', contents: [
        { type: 'subItems', value: '', subItems: 'x' },
        { type: 'text', value: {} },
      ] }],
    }]);

    expect(section.items[0].contents).toEqual([
      { type: 'subItems', value: '', subItems: [] },
      { type: 'text', value: '' },
    ]);
    expect(calculateSectionsProgress([section])).toBe(0);
  });

  it('keeps valid content and legacy completion as before', () => {
    const [section] = normalizeSections([{
      id: 's1',
      title: 'Launch',
      items: [{
        id: 'i1',
        title: 'Task',
        completed: true,
        notes: 'Keep',
        contents: [{ id: 'c', type: 'subItems', value: '', subItems: [{ id: 'a', title: 'A', completed: true }] }],
      }],
    }]);

    expect(section.items[0]).toEqual({
      id: 'i1',
      title: 'Task',
      isCompleted: true,
      notes: 'Keep',
      contents: [{ id: 'c', type: 'subItems', value: '', subItems: [{ id: 'a', title: 'A', isCompleted: true }] }],
    });
    expect(calculateSectionsProgress([section])).toBe(100);
  });
});
