import { describe, expect, it } from 'vitest';
import {
  MAX_SHARED_RUN_NOTES_LENGTH,
  mergeSharedRunState,
  sharedRunUpdateSchema,
} from '@functions/api/utils/shared-run-merge';

type Json = Record<string, unknown>;

const stored: Json[] = [
  {
    id: 's1',
    title: 'Section',
    items: [
      {
        id: 'i1',
        title: 'Task one',
        isCompleted: false,
        subItems: [{ id: 'd1', title: 'Direct', isCompleted: false }],
        contents: [
          { type: 'text', value: 'Instructions' },
          {
            type: 'subItems',
            value: '',
            subItems: [
              { title: 'No id A', isCompleted: false },
              { title: 'No id B', isCompleted: false },
            ],
          },
        ],
      },
      { id: 'i2', title: 'Task two', completed: true },
    ],
  },
];

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function guest(sections: unknown) {
  const parsed = sharedRunUpdateSchema.parse({ sections, expected_revision: 1 });
  return parsed.sections ?? [];
}

function merge(sections: unknown, storedSections: unknown[] = stored) {
  const result = mergeSharedRunState(copy(storedSections), guest(sections));
  if ('error' in result) throw new Error(result.error);
  return result.sections as Json[];
}

function stripGuestState(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGuestState);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['isCompleted', 'completed', 'notes'].includes(key))
      .map(([key, entry]) => [key, stripGuestState(entry)]),
  );
}

describe('mergeSharedRunState', () => {
  it.each([
    ['an empty list', []],
    ['renamed titles', [{ id: 's1', title: 'X', items: [{ id: 'i1', title: 'Log in here' }, { id: 'i2', title: 'Y' }] }]],
    ['added items and sections', [
      { id: 's1', items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3', title: 'New' }] },
      { id: 's9', items: [{ id: 'i9', title: 'New' }] },
    ]],
    ['dropped items', [{ id: 's1', items: [{ id: 'i2' }] }]],
    ['reordered items', [{ id: 's1', items: [{ id: 'i2' }, { id: 'i1' }] }]],
    ['injected contents', [{ id: 's1', items: [{ id: 'i1', contents: [{ type: 'file', value: 'https://attacker.example' }] }] }]],
  ])('never changes the stored structure for %s', (_label, sections) => {
    expect(stripGuestState(merge(sections))).toEqual(stripGuestState(stored));
  });

  it('keeps stored completion for tasks the payload leaves out', () => {
    const merged = merge([{ id: 's1', items: [{ id: 'i1', isCompleted: true }] }]);
    const items = merged[0].items as Json[];
    expect(items[0].isCompleted).toBe(true);
    expect(items[1].completed).toBe(true);
  });

  it('normalizes a legacy completed flag to isCompleted', () => {
    const merged = merge([{ id: 's1', items: [{ id: 'i2', isCompleted: false }] }]);
    const item = (merged[0].items as Json[])[1];
    expect(item.isCompleted).toBe(false);
    expect(item).not.toHaveProperty('completed');
  });

  it('matches direct sub-items by id and content sub-items without ids by position', () => {
    const merged = merge([{
      id: 's1',
      items: [{
        id: 'i1',
        subItems: [{ id: 'd1', isCompleted: true }],
        contents: [
          { type: 'text', value: 'Changed' },
          { type: 'subItems', subItems: [{ title: 'No id A', isCompleted: false }, { title: 'No id B', isCompleted: true }] },
        ],
      }],
    }]);
    const item = (merged[0].items as Json[])[0];
    expect((item.subItems as Json[])[0].isCompleted).toBe(true);
    const contents = item.contents as Json[];
    expect(contents[0].value).toBe('Instructions');
    expect((contents[1].subItems as Json[]).map((subItem) => subItem.isCompleted)).toEqual([false, true]);
  });

  it('falls back to position for duplicate sub-item ids', () => {
    const storedDuplicates = [{
      id: 's1',
      items: [{ id: 'i1', subItems: [{ id: 'dup', title: 'A' }, { id: 'dup', title: 'B' }] }],
    }];
    const merged = merge(
      [{ id: 's1', items: [{ id: 'i1', subItems: [{ id: 'dup', isCompleted: false }, { id: 'dup', isCompleted: true }] }] }],
      storedDuplicates,
    );
    expect(((merged[0].items as Json[])[0].subItems as Json[]).map((subItem) => subItem.isCompleted))
      .toEqual([false, true]);
  });

  it('uses the share page fallback ids for legacy sections and items without ids', () => {
    const legacy = [{ title: 'Checklist', items: [{ title: 'A' }, { title: 'B' }] }];
    const merged = merge([{ id: '1', items: [{ id: '1-1', isCompleted: false }, { id: '1-2', isCompleted: true }] }], legacy);
    expect(merged).toEqual([{ title: 'Checklist', items: [{ title: 'A', isCompleted: false }, { title: 'B', isCompleted: true }] }]);
  });

  it('wraps a legacy flat list the way the share page does', () => {
    const merged = merge([{ id: '1', items: [{ id: 'a', isCompleted: true }] }], [{ id: 'a', title: 'A' }]);
    expect(merged).toEqual([{ id: '1', title: 'Checklist', items: [{ id: 'a', title: 'A', isCompleted: true }] }]);
  });

  it('saves notes and rejects changed notes over the cap', () => {
    const merged = merge([{ id: 's1', items: [{ id: 'i1', notes: 'Done by guest' }] }]);
    expect((merged[0].items as Json[])[0].notes).toBe('Done by guest');

    const result = mergeSharedRunState(copy(stored), guest([
      { id: 's1', items: [{ id: 'i1', notes: 'x'.repeat(MAX_SHARED_RUN_NOTES_LENGTH + 1) }] },
    ]));
    expect(result).toHaveProperty('error');
  });

  it('accepts long notes the owner already saved when the guest leaves them unchanged', () => {
    const longNotes = 'y'.repeat(MAX_SHARED_RUN_NOTES_LENGTH + 10);
    const storedWithNotes = [{ id: 's1', items: [{ id: 'i1', title: 'T', notes: longNotes }] }];
    const merged = merge([{ id: 's1', items: [{ id: 'i1', notes: longNotes, isCompleted: true }] }], storedWithNotes);
    expect((merged[0].items as Json[])[0]).toEqual({ id: 'i1', title: 'T', notes: longNotes, isCompleted: true });
  });
});

describe('sharedRunUpdateSchema', () => {
  it('requires expected_revision', () => {
    expect(sharedRunUpdateSchema.safeParse({ sections: [] }).success).toBe(false);
  });

  it('drops fields a guest may not set', () => {
    const parsed = sharedRunUpdateSchema.parse({
      title: 'Renamed',
      progress: 100,
      completed_at: '2020-01-01T00:00:00.000Z',
      status: 'completed',
      expected_revision: 2,
    });
    expect(parsed).toEqual({ status: 'completed', expected_revision: 2 });
  });
});
