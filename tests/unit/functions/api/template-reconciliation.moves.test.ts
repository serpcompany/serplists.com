import { describe, expect, it } from 'vitest';
import { contentAt, elementAt, firstOf, subTaskAt, taskIn } from '../../../support/elements';

import { calculateRunProgress, reconcileRunSections } from '@functions/api/utils/template-reconciliation';
import { sectionsOf } from '../../../support/reconciledSections';

describe('work that moves to another section or task, which keeps its run state since ids are unique across the Template', () => {
  const x = { id: 'x', title: 'Call vendor', isCompleted: true, notes: 'called vendor' };
  const y = { id: 'y', title: 'Draft brief', isCompleted: false };
  const z = { id: 'z', title: 'Publish', isCompleted: true, notes: 'live' };
  const previous = [
    { id: 'A', title: 'Plan', items: [x, y] },
    { id: 'B', title: 'Ship', items: [z] },
  ];
  const fresh = ({ id, title }: { id: string; title: string }) => ({ id, title });

  it('keeps the state of a task moved to a later section and retires nothing', () => {
    const result = reconcileRunSections(previous, [
      { id: 'A', title: 'Plan', items: [fresh(y)] },
      { id: 'B', title: 'Ship', items: [fresh(z), fresh(x)] },
    ], []);

    expect(taskIn(sectionsOf(result), 1, 1)).toEqual(expect.objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(taskIn(sectionsOf(result), 1, 0)).toEqual(expect.objectContaining({ id: 'z', isCompleted: true, notes: 'live' }));
    expect(result.retired).toEqual([]);
    expect(result.newlyRetired).toEqual([]);
    expect(calculateRunProgress(result.sections)).toBe(calculateRunProgress(previous));
  });

  it('keeps the state of a task moved to an earlier section', () => {
    const result = reconcileRunSections(previous, [
      { id: 'A', title: 'Plan', items: [fresh(z), fresh(x), fresh(y)] },
      { id: 'B', title: 'Ship', items: [] },
    ], []);

    expect(taskIn(sectionsOf(result), 0, 0)).toEqual(expect.objectContaining({ id: 'z', isCompleted: true, notes: 'live' }));
    expect(result.retired).toEqual([]);
  });

  it('leaves a moved task out of the section it left when that section is removed', () => {
    const result = reconcileRunSections(previous, [{ id: 'B', title: 'Ship', items: [fresh(z), fresh(x)] }], []);

    expect(taskIn(sectionsOf(result), 0, 1)).toEqual(expect.objectContaining({ id: 'x', isCompleted: true, notes: 'called vendor' }));
    expect(result.newlyRetired).toEqual([{ kind: 'section', section: { id: 'A', title: 'Plan', items: [y] } }]);
  });

  it('retires nothing for a removed section whose tasks all moved', () => {
    const result = reconcileRunSections(previous, [{ id: 'B', title: 'Ship', items: [fresh(x), fresh(z), fresh(y)] }], []);

    expect(firstOf(sectionsOf(result)).items.map((item) => [item.id, item.isCompleted])).toEqual([['x', true], ['z', true], ['y', false]]);
    expect(result.retired).toEqual([]);
  });

  it('never brings back a stale retired copy when the task moves back', () => {
    const moved = reconcileRunSections(previous, [
      { id: 'A', title: 'Plan', items: [fresh(y)] },
      { id: 'B', title: 'Ship', items: [fresh(z), fresh(x)] },
    ], []);
    const untickedAndNotedAgainInItsNewSection = structuredClone(sectionsOf(moved));
    elementAt(untickedAndNotedAgainInItsNewSection, 1).items[1] = { ...taskIn(untickedAndNotedAgainInItsNewSection, 1, 1), isCompleted: false, notes: 'vendor called back' };
    const stale = { kind: 'item', sectionId: 'A', item: x };

    const back = reconcileRunSections(untickedAndNotedAgainInItsNewSection, [
      { id: 'A', title: 'Plan', items: [fresh(x), fresh(y)] },
      { id: 'B', title: 'Ship', items: [fresh(z)] },
    ], [stale]);

    expect(taskIn(sectionsOf(back), 0, 0)).toEqual(expect.objectContaining({ id: 'x', isCompleted: false, notes: 'vendor called back' }));
    expect(back.newlyRetired).toEqual([]);
  });

  describe('Sub-tasks', () => {
    const subTasks = (...list: Array<Record<string, unknown>>) => [{ type: 'subItems', value: '', subItems: list }];
    const s1 = { id: 's1', title: 'Quote', isCompleted: true };
    const s2 = { id: 's2', title: 'Invoice', isCompleted: false };
    const withSubTasks = [
      { id: 'A', title: 'Plan', items: [{ id: 'p', title: 'Buy', isCompleted: false, contents: subTasks(s1, s2) }] },
      { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', isCompleted: false, subItems: [{ id: 's3', title: 'Pay', isCompleted: false }] }] },
    ];
    const bare = ({ id, title }: { id: string; title: string }) => ({ id, title });

    it('keeps the state of a Sub-task moved to a task in another section', () => {
      const result = reconcileRunSections(withSubTasks, [
        { id: 'A', title: 'Plan', items: [{ id: 'p', title: 'Buy', contents: subTasks(bare(s2)) }] },
        { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', subItems: [{ id: 's3', title: 'Pay' }], contents: subTasks(bare(s1)) }] },
      ], []);

      expect(contentAt(taskIn(sectionsOf(result), 1, 0), 0).subItems).toEqual([{ id: 's1', title: 'Quote', isCompleted: true }]);
      expect(contentAt(taskIn(sectionsOf(result), 0, 0), 0).subItems).toEqual([{ id: 's2', title: 'Invoice', isCompleted: false }]);
      expect(result.retired).toEqual([]);
    });

    it('completes the task it moved out of when only finished Sub-tasks are left there', () => {
      const result = reconcileRunSections(withSubTasks, [
        { id: 'A', title: 'Plan', items: [{ id: 'p', title: 'Buy', contents: subTasks(bare(s1)) }] },
        { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', subItems: [{ id: 's3', title: 'Pay' }], contents: subTasks(bare(s2)) }] },
      ], []);

      expect(taskIn(sectionsOf(result), 0, 0).isCompleted).toBe(true);
      expect(subTaskAt(contentAt(taskIn(sectionsOf(result), 1, 0), 0), 0)).toEqual({ id: 's2', title: 'Invoice', isCompleted: false });
      expect(result.retired).toEqual([]);
    });

    it('leaves a moved Sub-task out of the task it left when that task is removed', () => {
      const result = reconcileRunSections(withSubTasks, [
        { id: 'A', title: 'Plan', items: [] },
        { id: 'B', title: 'Ship', items: [{ id: 'q', title: 'Pay', subItems: [{ id: 's3', title: 'Pay' }], contents: subTasks(bare(s1)) }] },
      ], []);

      expect(subTaskAt(contentAt(taskIn(sectionsOf(result), 1, 0), 0), 0)).toEqual({ id: 's1', title: 'Quote', isCompleted: true });
      expect(result.newlyRetired).toEqual([{
        kind: 'item',
        sectionId: 'A',
        sectionTitle: 'Plan',
        item: { id: 'p', title: 'Buy', isCompleted: false, contents: subTasks(s2) },
      }]);
    });
  });

  describe('ids a legacy run from before ids were unique across the Template repeats in several sections', () => {
    const legacy = [
      { id: 'A', title: 'Plan', items: [{ id: '1', title: 'First', isCompleted: true, notes: 'a' }] },
      { id: 'B', title: 'Ship', items: [{ id: '1', title: 'First', isCompleted: false, notes: 'b' }] },
    ];

    it('still matches each copy in its own section', () => {
      const result = reconcileRunSections(legacy, [
        { id: 'A', title: 'Plan', items: [{ id: '1', title: 'First' }] },
        { id: 'B', title: 'Ship', items: [{ id: '1', title: 'First' }] },
      ], []);

      expect(sectionsOf(result).map((section) => firstOf(section.items).notes)).toEqual(['a', 'b']);
      expect(result.retired).toEqual([]);
    });

    it('retires the copy of a removed section instead of moving it', () => {
      const result = reconcileRunSections(legacy, [{ id: 'B', title: 'Ship', items: [{ id: '1', title: 'First' }] }], []);

      expect(taskIn(sectionsOf(result), 0, 0)).toEqual(expect.objectContaining({ notes: 'b', isCompleted: false }));
      expect(result.newlyRetired).toEqual([{ kind: 'section', section: legacy[0] }]);
    });

    it('never guesses which copy moved to another section', () => {
      const result = reconcileRunSections(legacy, [{ id: 'C', title: 'Later', items: [{ id: '1', title: 'First' }] }], []);

      expect(taskIn(sectionsOf(result), 0, 0)).toEqual({ id: '1', title: 'First', isCompleted: false });
      expect(result.newlyRetired).toHaveLength(2);
    });
  });

  it('keeps every task and Sub-task state when ids are only rearranged between parents, a task with Sub-tasks being complete exactly when they are', () => {
    const subTaskBlock = (...list: Array<[string, boolean]>) =>
      [{ type: 'subItems', value: '', subItems: list.map(([id, isCompleted]) => ({ id, title: id, isCompleted })) }];
    const run = [
      { id: 'A', title: 'A', items: [
        { id: 'a1', title: 'a1', isCompleted: true, notes: 'n-a1', contents: subTaskBlock(['u1', true], ['u2', false]) },
        { id: 'a2', title: 'a2', isCompleted: false, notes: 'n-a2' },
      ] },
      { id: 'B', title: 'B', items: [
        { id: 'b1', title: 'b1', isCompleted: false, contents: subTaskBlock(['u3', true]) },
        { id: 'b2', title: 'b2', isCompleted: true, notes: 'n-b2' },
      ] },
      { id: 'C', title: 'C', items: [{ id: 'c1', title: 'c1', isCompleted: true }] },
    ];
    type Entry = { id: string; isCompleted?: unknown; notes?: unknown; contents?: Array<{ subItems?: Entry[] }> };
    const notesAndOwnCompletionById = (sections: Array<{ items: Entry[] }>) => new Map(sections.flatMap((section) => section.items.flatMap((item) => {
      const subItems = (item.contents ?? []).flatMap((content) => content.subItems ?? []);
      return [
        [item.id, { notes: item.notes, ...(subItems.length > 0 ? {} : { isCompleted: item.isCompleted }) }],
        ...subItems.map((subItem) => [subItem.id, { isCompleted: subItem.isCompleted }]),
      ] as Array<[string, Record<string, unknown>]>;
    })));
    const layout = (sections: Record<string, Record<string, string[]>>) => Object.entries(sections).map(([sectionId, items]) => ({
      id: sectionId,
      title: sectionId,
      items: Object.entries(items).map(([itemId, subIds]) => ({
        id: itemId,
        title: itemId,
        ...(subIds.length > 0 ? { contents: [{ type: 'subItems', value: '', subItems: subIds.map((id) => ({ id, title: id })) }] } : {}),
      })),
    }));
    const before = notesAndOwnCompletionById(run);
    const rearrangements: Array<Record<string, Record<string, string[]>>> = [
      { C: { b2: [], a1: ['u3'] }, A: { c1: ['u2', 'u1'], a2: [] }, B: { b1: [] } },
      { B: { a2: ['u1', 'u2', 'u3'], b1: [], b2: [] }, A: { c1: [], a1: [] }, C: {} },
      { A: { b1: ['u2'], a1: ['u1'] }, B: {}, C: { c1: ['u3'], a2: [], b2: [] } },
    ];

    for (const rearranged of rearrangements) {
      const result = reconcileRunSections(run, layout(rearranged), []);
      for (const [id, after] of notesAndOwnCompletionById(result.sections as Array<{ items: Entry[] }>)) {
        const had = before.get(id)!;
        expect(after.notes, id).toBe(had.notes);
        if ('isCompleted' in after && 'isCompleted' in had) expect(after.isCompleted, id).toBe(had.isCompleted);
      }
      expect(result.retired).toEqual([]);
    }
  });
});
