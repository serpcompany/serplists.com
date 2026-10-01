import { describe, expect, it } from 'vitest';
import { contentAt, firstOf, taskIn } from '../../../support/elements';

import { reconcileRunSections } from '@functions/api/utils/template-reconciliation';
import { sectionsOf } from '../../../support/reconciledSections';
import { objectContaining } from '../../../support/asymmetricMatchers';

describe('malformed Template content', () => {
  it('never copies a malformed Sub-task list or value into a run', () => {
    const previous = [{ id: 's1', title: 'Launch', items: [{ id: 'i1', title: 'Task', isCompleted: true, notes: 'Keep' }] }];
    const template = [{
      id: 's1',
      title: 'Launch',
      items: [{
        id: 'i1',
        title: 'Task',
        subItems: 'x',
        contents: [
          { type: 'subItems', value: '', subItems: 'x' },
          { type: 'subItems', value: '', subItems: { a: 1 } },
          { type: 'text', value: {} },
          { type: 'poll', value: 'x' },
          'x',
        ],
      }],
    }];

    const item = firstOf(firstOf(sectionsOf(reconcileRunSections(previous, template, []))).items);

    expect(item.contents).toEqual([
      { type: 'subItems', value: '', subItems: [] },
      { type: 'subItems', value: '', subItems: [] },
      { type: 'text', value: '' },
    ]);
    expect(item.subItems).toEqual([]);
    expect(item).toEqual(objectContaining({ isCompleted: true, notes: 'Keep' }));
  });
});

describe('retired run work', () => {
  const section = (items: unknown[]) => [{ id: 'section-1', title: 'Launch', items }];
  const dns = { id: 'item-dns', title: 'Check DNS', isCompleted: true, notes: 'TTL lowered to 300' };
  const copy = { id: 'item-copy', title: 'Write copy', isCompleted: false };

  it('reports only the work this reconcile retired', () => {
    const earlier = { kind: 'item', sectionId: 'section-1', item: { id: 'item-old', title: 'Old', notes: 'Earlier' } };
    const result = reconcileRunSections(section([dns, copy]), section([{ id: 'item-copy', title: 'Write copy' }]), [earlier]);

    expect(result.newlyRetired).toEqual([
      objectContaining({ kind: 'item', item: objectContaining({ id: 'item-dns', notes: 'TTL lowered to 300' }) }),
    ]);
    expect(result.retired).toEqual([earlier, ...result.newlyRetired]);
  });

  it('restores a retired task with its notes and completion when the Template brings its id back', () => {
    const removed = reconcileRunSections(section([dns, copy]), section([{ id: 'item-copy', title: 'Write copy' }]), []);
    const restored = reconcileRunSections(
      removed.sections,
      section([{ id: 'item-dns', title: 'Check DNS' }, { id: 'item-copy', title: 'Write copy' }]),
      removed.retired,
    );

    expect(taskIn(sectionsOf(restored), 0, 0)).toEqual(objectContaining({
      id: 'item-dns',
      isCompleted: true,
      notes: 'TTL lowered to 300',
    }));
    expect(restored.retired).toEqual([]);
    expect(restored.newlyRetired).toEqual([]);
  });

  it('restores retired sections and Sub-tasks by id', () => {
    const withSubTask = {
      id: 'item-copy',
      title: 'Write copy',
      contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-short', title: 'Short', isCompleted: true }] }],
    };
    const previousRetired = [
      { kind: 'section', section: { id: 'section-2', title: 'QA', items: [{ id: 'item-qa', title: 'Test', isCompleted: true, notes: 'Passed' }] } },
      { kind: 'subItem', sectionId: 'section-1', itemId: 'item-copy', subItem: { id: 'sub-long', title: 'Long', isCompleted: true } },
    ];
    const template = [
      {
        id: 'section-1',
        title: 'Launch',
        items: [{
          ...withSubTask,
          contents: [{ type: 'subItems', value: '', subItems: [{ id: 'sub-short', title: 'Short' }, { id: 'sub-long', title: 'Long' }] }],
        }],
      },
      { id: 'section-2', title: 'QA', items: [{ id: 'item-qa', title: 'Test' }] },
    ];

    const result = reconcileRunSections(section([withSubTask]), template, previousRetired);

    expect(contentAt(taskIn(sectionsOf(result), 0, 0), 0).subItems).toEqual([
      { id: 'sub-short', title: 'Short', isCompleted: true },
      { id: 'sub-long', title: 'Long', isCompleted: true },
    ]);
    expect(taskIn(sectionsOf(result), 0, 0).isCompleted).toBe(true);
    expect(taskIn(sectionsOf(result), 1, 0)).toEqual(objectContaining({ id: 'item-qa', isCompleted: true, notes: 'Passed' }));
    expect(result.retired).toEqual([]);
  });

  it('prefers the live copy and keeps a stale retired duplicate', () => {
    const stale = { kind: 'item', sectionId: 'section-1', item: { ...dns, notes: 'Stale' } };
    const result = reconcileRunSections(section([dns]), section([{ id: 'item-dns', title: 'Check DNS' }]), [stale]);

    expect(taskIn(sectionsOf(result), 0, 0).notes).toBe('TTL lowered to 300');
    expect(result.retired).toEqual([stale]);
  });

  it('keeps stored retired entries it cannot read, as they were, and restores nothing from them', () => {
    const unreadable = [
      { kind: 'task', item: { ...dns, notes: 'Unknown kind' } },
      { kind: 'item', item: [dns] },
      { kind: 'section' },
    ];
    const result = reconcileRunSections(section([copy]), section([{ id: 'item-dns', title: 'Check DNS' }]), [
      ...unreadable,
      'not an entry',
    ]);

    expect(taskIn(sectionsOf(result), 0, 0)).toEqual(objectContaining({ id: 'item-dns', isCompleted: false }));
    expect(taskIn(sectionsOf(result), 0, 0)).not.toHaveProperty('notes');
    expect(result.retired.slice(0, unreadable.length)).toEqual(unreadable);
  });
});
