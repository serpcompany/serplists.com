import { describe, expect, it } from 'vitest';
import { compactAuditDiff } from '@functions/api/utils/audit-compaction';

const items = (...tasks: unknown[]) => JSON.stringify([{ id: 's1', title: 'Launch', items: tasks }]);
const summaryOf = (before: unknown, after: string) => compactAuditDiff({ items: after }, before === undefined ? {} : { items: before });

describe('compactAuditDiff task summary', () => {
  it('lists reopened tasks and Sub-tasks, including Sub-tasks stored straight on the task', () => {
    const before = items({ id: 't1', isCompleted: true, subItems: [{ id: 'a', completed: true }, 'text only'] });
    const after = items({ id: 't1', isCompleted: false, subItems: [{ id: 'a', isCompleted: false }, 'text only'] });

    expect(summaryOf(before, after)).toEqual({ items: { sections: 1, items: 1, reopened: ['t1', 't1/a'] } });
  });

  it('keys tasks without an id by their place and tasks sharing an id by their copy, so each counts once', () => {
    const before = items({ title: 'No id' }, { id: 'dup', isCompleted: false }, { id: 'dup', isCompleted: false });
    const after = items({ title: 'No id', isCompleted: true }, { id: 'dup', isCompleted: false }, { id: 'dup', isCompleted: true });

    expect(summaryOf(before, after)).toEqual({ items: { sections: 1, items: 3, completed: ['1-1', 'dup#2'] } });
  });

  it('keys Sub-tasks without an id by their place and skips content that is not a record', () => {
    const before = items({ id: 't1', contents: ['loose text', { type: 'subItems', subItems: [{ completed: false }] }] });
    const after = items({ id: 't1', contents: ['loose text', { type: 'subItems', subItems: [{ completed: true }] }] });

    expect(summaryOf(before, after)).toEqual({ items: { sections: 1, items: 1, completed: ['t1/1'] } });
  });

  it('counts a note added to a task with none as a notes change', () => {
    expect(summaryOf(items({ id: 't1' }), items({ id: 't1', notes: 'Called the client' }))).toEqual({
      items: { sections: 1, items: 1, notesChanged: ['t1'] },
    });
  });

  it('lists at most fifty ids of each kind and counts the rest', () => {
    const many = Array.from({ length: 53 }, (_, index) => ({ id: `t${index}` }));
    const summary = summaryOf(items(), items(...many));

    expect(summary).toMatchObject({ items: { sections: 1, items: 53, omittedIds: 3 } });
    expect(JSON.stringify(summary)).not.toContain('"t52"');
  });

  it('only counts the new tasks when the earlier ones cannot be read', () => {
    expect(summaryOf('not json', items({ id: 't1' }))).toEqual({ items: { sections: 1, items: 1 } });
    expect(compactAuditDiff({ items: items({ id: 't1' }) }, 'not a row')).toEqual({ items: { sections: 1, items: 1 } });
  });

  it('omits tasks it cannot read and sections that are not records', () => {
    expect(summaryOf(undefined, '{"not":"a list"}')).toEqual({ items: { omitted: true } });
    expect(summaryOf(undefined, JSON.stringify([{ id: 's2', title: 'Odd', items: 'none' }, 'not a section']))).toEqual({
      items: { sections: 2, items: 0 },
    });
  });

  it('omits retired entries it cannot read and leaves a diff that is not a row alone', () => {
    expect(compactAuditDiff({ retired_items: '{broken' }, {})).toEqual({ retired_items: { omitted: true } });
    expect(compactAuditDiff('status only', {})).toBe('status only');
  });
});
