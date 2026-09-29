import { describe, expect, it } from 'vitest';

import { withStableItemsColumn, withStableTemplateIdentities } from '@functions/api/utils/template-identities';
import { templateStructureChanged } from '@functions/api/utils/template-changes';
import {
  assignMissingStableTemplateIdentities,
  validateStableTemplateIdentities,
} from '@functions/api/utils/template-reconciliation';

type Row = Record<string, unknown>;

// Stored sections whose ids the API does not accept: numbers, blanks, whitespace, none.
const legacySections = [
  {
    id: 1,
    title: 'Plan',
    items: [
      {
        id: '  ',
        title: 'Scope',
        subItems: [{ id: 1, title: 'Direct' }],
        contents: [
          { type: 'text', value: 'Notes' },
          { type: 'subItems', value: '', subItems: [{ id: 2, title: 'In a block' }, { title: 'No id' }] },
        ],
      },
      { id: 'kept-task', title: 'Kept', contents: [{ type: 'subItems', value: '', subItems: [{ id: 1, title: 'Again 1' }] }] },
      { title: 'Untitled id' },
    ],
  },
  { id: 'kept-section', title: 'Ship', items: [{ id: '', title: 'Release' }] },
];

// Every section, task and Sub-task id, in the order the identity pass numbers them.
const ids = (sections: unknown[]): unknown[] => (sections.filter((section) => typeof section === 'object' && section !== null) as Row[])
  .flatMap((section) => [
    section.id,
    ...((section.items as unknown[]).filter((item) => typeof item === 'object' && item !== null) as Row[]).flatMap((item) => [
      item.id,
      ...((item.subItems as Row[] | undefined) ?? []).filter((subItem) => typeof subItem === 'object').map((subItem) => subItem.id),
      ...((item.contents as Row[] | undefined) ?? []).flatMap((content) =>
        ((content.subItems as Row[] | undefined) ?? []).filter((subItem) => typeof subItem === 'object').map((subItem) => subItem.id)),
    ]),
  ]);

describe('withStableTemplateIdentities', () => {
  it('gives each entry without an accepted id the id a save stores, and keeps accepted ids', () => {
    const stable = withStableTemplateIdentities(legacySections);

    expect(ids(stable)).toEqual(ids(assignMissingStableTemplateIdentities(legacySections)));
    expect(ids(stable)).toEqual([
      'legacy-section-1',
      'legacy-item-1-1', 'legacy-subitem-1-1-1', 'legacy-subitem-1-1-2', 'legacy-subitem-1-1-3',
      'kept-task', 'legacy-subitem-1-2-1',
      'legacy-item-1-3',
      'kept-section', 'legacy-item-2-1',
    ]);
    expect(validateStableTemplateIdentities(stable)).toBeNull();
    // Only ids change.
    expect((stable[0] as Row).title).toBe('Plan');
    expect(((stable[0] as Row).items as Row[])[0].contents).toEqual([
      { type: 'text', value: 'Notes' },
      { type: 'subItems', value: '', subItems: [{ id: 'legacy-subitem-1-1-2', title: 'In a block' }, { id: 'legacy-subitem-1-1-3', title: 'No id' }] },
    ]);
  });

  it('leaves entries that are not objects where they are, numbering the others as a save does', () => {
    const sections = ['junk', { title: 'Plan', items: ['A text task', { title: 'First' }, { title: 'Second', subItems: ['text', { title: 'Sub' }] }] }];

    expect(withStableTemplateIdentities(sections)).toEqual([
      'junk',
      {
        id: 'legacy-section-1',
        title: 'Plan',
        items: [
          'A text task',
          { id: 'legacy-item-1-1', title: 'First' },
          { id: 'legacy-item-1-2', title: 'Second', subItems: ['text', { id: 'legacy-subitem-1-2-1', title: 'Sub' }] },
        ],
      },
    ]);
    expect(ids(withStableTemplateIdentities(sections))).toEqual(ids(assignMissingStableTemplateIdentities(sections)));
  });

  it('returns sections that already have every id as they are', () => {
    const sections = [{ id: 's1', title: 'Plan', items: [{ id: 't1', title: 'Task', contents: [{ type: 'subItems', subItems: [{ id: 'u1' }] }] }] }];

    expect(withStableTemplateIdentities(sections)).toBe(sections);
  });

  it('lets an editor that sends the ids back save without renumbering or a structure change', () => {
    const stored = JSON.parse(JSON.stringify(legacySections)) as unknown[];
    const loaded = withStableTemplateIdentities(stored);

    const saved = assignMissingStableTemplateIdentities(loaded, stored);

    expect(ids(saved)).toEqual(ids(loaded));
    expect(templateStructureChanged(stored, saved)).toBe(false);
    // Once saved, the next load and save keep the same ids.
    expect(ids(withStableTemplateIdentities(saved))).toEqual(ids(loaded));
    expect(templateStructureChanged(saved, assignMissingStableTemplateIdentities(withStableTemplateIdentities(saved), saved))).toBe(false);
  });
});

describe('withStableItemsColumn', () => {
  it('stores ids in a column that lacks them and leaves others untouched', () => {
    const complete = JSON.stringify([{ id: 's1', title: 'Plan', items: [{ id: 't1', title: 'Task' }] }]);

    expect(withStableItemsColumn(complete)).toBe(complete);
    expect(withStableItemsColumn('not json')).toBe('not json');
    expect(ids(JSON.parse(withStableItemsColumn(JSON.stringify(legacySections))))).toEqual(
      ids(assignMissingStableTemplateIdentities(legacySections)),
    );
  });
});
