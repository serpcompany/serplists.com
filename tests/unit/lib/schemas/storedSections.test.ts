import { describe, expect, it } from 'vitest';
import { firstOf } from '../../../support/elements';

import {
  findStoredSectionsIssue,
  sanitizeStoredSections,
} from '@/lib/schemas/storedSections';
import { sectionRecordsIn, taskRecordsIn } from '@/lib/schemas/jsonRecords';
import { malformedSectionsStoredBeforeValidation } from '../../../fixtures/malformedSections';

const withContent = (content: unknown) => [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Task', contents: [content] }] }];

describe('findStoredSectionsIssue', () => {
  it.each(malformedSectionsStoredBeforeValidation)('rejects %s and names the path', (_label, sections) => {
    expect(findStoredSectionsIssue(sections)).toMatch(/^sections\[0\]/);
  });

  it('names the exact field', () => {
    expect(findStoredSectionsIssue(withContent({ type: 'subItems', value: '', subItems: 'x' })))
      .toBe('sections[0].items[0].contents[0].subItems: Expected array, received string');
  });

  it('accepts every legacy and run shape the app stores', () => {
    const sections = [
      {
        id: 's1',
        title: '',
        extra: { kept: true },
        items: [
          { id: 'i1', title: '', isCompleted: true, notes: 'Run notes', completed_at: '2026-01-01' },
          { id: 'i2', title: 'Legacy', completed: true, subItems: [{ id: 'a', title: 'A', completed: true }] },
          {
            id: 'i3',
            title: 'Blocks',
            description: null,
            contents: [
              { type: 'subItems', value: '', subItems: [{ title: 'No id yet' }] },
              { type: 'subItems', subItems: [] },
              { type: 'text', value: '**Markdown**' },
              { id: 'c', type: 'file', value: 'https://x.test/f.pdf', uploadType: 'upload', fileName: 'f.pdf', fileSize: 12 },
            ],
          },
        ],
      },
      { id: 's2', title: 'Empty' },
    ];

    expect(findStoredSectionsIssue(sections)).toBeNull();
    expect(findStoredSectionsIssue([])).toBeNull();
  });
});

describe('sanitizeStoredSections', () => {
  it.each(malformedSectionsStoredBeforeValidation)('makes %s safe to store and render', (_label, sections) => {
    const sanitized = sanitizeStoredSections(sections);

    expect(findStoredSectionsIssue(sanitized)).toBeNull();
  });

  it('keeps valid content as it is', () => {
    const sections = [{
      id: 's1',
      title: 'Launch',
      items: [{
        id: 'i1',
        title: 'Task',
        notes: 'Keep',
        contents: [
          { id: 'c1', type: 'text', value: 'Body' },
          { id: 'c2', type: 'subItems', value: '', subItems: [{ id: 'a', title: 'A', isCompleted: true }] },
        ],
      }],
    }];

    expect(sanitizeStoredSections(sections)).toEqual(sections);
  });

  it('turns a malformed Sub-task list into an empty one and a non-text value into empty text', () => {
    const section = firstOf(sectionRecordsIn(sanitizeStoredSections([{
      id: 's1',
      title: 'Launch',
      items: [{ id: 'i1', title: 'Task', contents: [
        { type: 'subItems', value: '', subItems: 'x' },
        { type: 'text', value: {} },
        { type: 'poll', value: 'dropped' },
        'dropped',
      ] }],
    }])));

    expect(firstOf(taskRecordsIn(section.items)).contents).toEqual([
      { type: 'subItems', value: '', subItems: [] },
      { type: 'text', value: '' },
    ]);
  });

  it('always produces storable sections from random JSON', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const leaf = () => [null, 'x', 5, true, {}, [], ['x'], [{}], { title: {} }][Math.floor(random() * 9)];
    const node = (depth: number): unknown => {
      if (depth === 0 || random() < 0.2) return leaf();
      const keys = ['id', 'title', 'items', 'contents', 'subItems', 'type', 'value', 'notes', 'description', 'isCompleted', 'fileName'];
      if (random() < 0.4) return Array.from({ length: Math.floor(random() * 3) }, () => node(depth - 1));
      return Object.fromEntries(keys.filter(() => random() < 0.5).map((key) => [
        key,
        key === 'type' ? ['text', 'subItems', 'poll', 3][Math.floor(random() * 4)] : node(depth - 1),
      ]));
    };

    for (let run = 0; run < 300; run += 1) {
      const input = Array.from({ length: 1 + Math.floor(random() * 3) }, () => node(4));
      expect(findStoredSectionsIssue(sanitizeStoredSections(input))).toBeNull();
    }
  });
});
