import { describe, expect, it } from 'vitest';
import { firstOf } from '../../../support/elements';

import { withStableItemsColumn, withStableTemplateIdentities } from '@functions/api/utils/template-identities';
import { templateStructureChanged } from '@functions/api/utils/template-changes';
import { normalizeSectionsPayload } from '@functions/api/utils/payloads';
import {
  assignMissingStableTemplateIdentities,
  validateStableTemplateIdentities,
} from '@functions/api/utils/template-reconciliation';
import { jsonRecordsIn } from '../../../support/storedJson';

type Row = Record<string, unknown>;

const storedSectionsWithNumericBlankOrMissingIds = [
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

const idsInNumberingOrder = (sections: unknown[]): unknown[] => (sections.filter((section) => typeof section === 'object' && section !== null) as Row[])
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
    const stable = withStableTemplateIdentities(storedSectionsWithNumericBlankOrMissingIds);
    const subItemOnTheTaskItselfWhichIsNoSubTask = 1;

    expect(idsInNumberingOrder(stable)).toEqual(idsInNumberingOrder(assignMissingStableTemplateIdentities(storedSectionsWithNumericBlankOrMissingIds)));
    expect(idsInNumberingOrder(stable)).toEqual([
      'legacy-section-1',
      'legacy-item-1-1', subItemOnTheTaskItselfWhichIsNoSubTask, 'legacy-subitem-1-1-1', 'legacy-subitem-1-1-2',
      'kept-task', 'legacy-subitem-1-2-1',
      'legacy-item-1-3',
      'kept-section', 'legacy-item-2-1',
    ]);
    expect(validateStableTemplateIdentities(stable)).toBeNull();
  });

  it('changes nothing but the ids', () => {
    const stable = withStableTemplateIdentities(storedSectionsWithNumericBlankOrMissingIds);

    expect((stable[0] as Row).title).toBe('Plan');
    expect(firstOf((stable[0] as Row).items as Row[]).contents).toEqual([
      { type: 'text', value: 'Notes' },
      { type: 'subItems', value: '', subItems: [{ id: 'legacy-subitem-1-1-1', title: 'In a block' }, { id: 'legacy-subitem-1-1-2', title: 'No id' }] },
    ]);
  });

  it('leaves entries that are not objects where they are, numbering the others as a save does', () => {
    const sectionsWithJunkAfterTheFirstSection = [
      { title: 'Plan', items: ['A text task', { title: 'First' }, { title: 'Second', contents: [{ type: 'subItems', subItems: ['text', { title: 'Sub' }] }] }] },
      'junk',
      { title: 'Ship', items: [{ title: 'Release' }] },
    ];

    expect(withStableTemplateIdentities(sectionsWithJunkAfterTheFirstSection)).toEqual([
      {
        id: 'legacy-section-1',
        title: 'Plan',
        items: [
          'A text task',
          { id: 'legacy-item-1-1', title: 'First' },
          { id: 'legacy-item-1-2', title: 'Second', contents: [{ type: 'subItems', subItems: ['text', { id: 'legacy-subitem-1-2-1', title: 'Sub' }] }] },
        ],
      },
      'junk',
      { id: 'legacy-section-2', title: 'Ship', items: [{ id: 'legacy-item-2-1', title: 'Release' }] },
    ]);
    expect(idsInNumberingOrder(withStableTemplateIdentities(sectionsWithJunkAfterTheFirstSection)))
      .toEqual(idsInNumberingOrder(assignMissingStableTemplateIdentities(sectionsWithJunkAfterTheFirstSection)));
  });

  it('numbers a stored list that starts with an entry that is not an object as a save does, once read as a flat task list in one section', () => {
    const stored = ['junk', { title: 'Plan', items: [{ title: 'First' }] }];
    const { sections: readAsAFlatTaskList } = normalizeSectionsPayload(stored);

    expect(withStableTemplateIdentities(stored)).toBe(stored);
    expect(withStableTemplateIdentities(readAsAFlatTaskList)).toEqual([
      { id: '1', title: 'Checklist', items: ['junk', { id: 'legacy-item-1-1', title: 'Plan', items: [{ title: 'First' }] }] },
    ]);
    expect(idsInNumberingOrder(withStableTemplateIdentities(readAsAFlatTaskList)))
      .toEqual(idsInNumberingOrder(assignMissingStableTemplateIdentities(readAsAFlatTaskList)));
  });

  it('numbers the sections after a first section with items: null as a save does', () => {
    const sections = [{ id: 's1', title: 'Intro', items: null }, { title: 'Steps', items: [{ title: 'Create account' }] }];

    const stable = withStableTemplateIdentities(sections);

    expect(stable).toEqual([
      { id: 's1', title: 'Intro', items: null },
      { id: 'legacy-section-2', title: 'Steps', items: [{ id: 'legacy-item-2-1', title: 'Create account' }] },
    ]);
    const saved = assignMissingStableTemplateIdentities(sections);
    expect((stable as Row[]).map((section) => section.id)).toEqual(saved.map((section) => section.id));
    expect(templateStructureChanged(saved, assignMissingStableTemplateIdentities(stable, saved))).toBe(false);
  });

  it('returns sections that already have every id as they are', () => {
    const sections = [{ id: 's1', title: 'Plan', items: [{ id: 't1', title: 'Task', contents: [{ type: 'subItems', subItems: [{ id: 'u1' }] }] }] }];

    expect(withStableTemplateIdentities(sections)).toBe(sections);
  });

  it('lets an editor that sends the ids back save without renumbering or a structure change, then and on the next load and save', () => {
    const stored = structuredClone(storedSectionsWithNumericBlankOrMissingIds);
    const loaded = withStableTemplateIdentities(stored);

    const saved = assignMissingStableTemplateIdentities(loaded, stored);

    expect(idsInNumberingOrder(saved)).toEqual(idsInNumberingOrder(loaded));
    expect(templateStructureChanged(stored, saved)).toBe(false);
    const nextLoad = withStableTemplateIdentities(saved);
    expect(idsInNumberingOrder(nextLoad)).toEqual(idsInNumberingOrder(loaded));
    expect(templateStructureChanged(saved, assignMissingStableTemplateIdentities(nextLoad, saved))).toBe(false);
  });
});

describe('withStableItemsColumn', () => {
  it('stores ids in a column that lacks them and leaves others untouched', () => {
    const complete = JSON.stringify([{ id: 's1', title: 'Plan', items: [{ id: 't1', title: 'Task' }] }]);

    expect(withStableItemsColumn(complete)).toBe(complete);
    expect(withStableItemsColumn('not json')).toBe('not json');
    expect(idsInNumberingOrder(jsonRecordsIn(withStableItemsColumn(JSON.stringify(storedSectionsWithNumericBlankOrMissingIds))))).toEqual(
      idsInNumberingOrder(assignMissingStableTemplateIdentities(storedSectionsWithNumericBlankOrMissingIds)),
    );
  });
});
