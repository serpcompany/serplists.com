import { describe, expect, it } from 'vitest';

import { parseRetiredRunItems } from '@/features/run-execution/retiredRunItems';

const plan = {
  id: 'plan',
  label: 'Plan',
  kind: 'select',
  required: true,
  options: [{ id: 'o1', label: 'Pro' }, { id: 'o2', label: 'Basic' }],
  answer: 'o1',
};

describe('retired form answers on the run page', () => {
  it('reads a retired answer as its field label and the answer text, options by label', () => {
    expect(parseRetiredRunItems([
      { kind: 'formAnswer', sectionId: 's1', itemId: 't1', itemTitle: 'Collect brief', field: plan },
    ])).toEqual([
      { kind: 'formAnswer', id: 'plan', itemTitle: 'Collect brief', formAnswer: { fieldId: 'plan', label: 'Plan', kind: 'select', answer: 'Pro' } },
    ]);
  });

  it('skips a retired answer that is empty or not a field', () => {
    expect(parseRetiredRunItems([
      { kind: 'formAnswer', itemId: 't1', field: { ...plan, answer: '' } },
      { kind: 'formAnswer', itemId: 't1', field: { id: 'x', label: 'Color', kind: 'color', answer: 'red' } },
      { kind: 'formAnswer', itemId: 't1', field: 'x' },
    ])).toEqual([]);
  });

  it('lists the answered fields of a removed task with it', () => {
    const [entry] = parseRetiredRunItems([{
      kind: 'item',
      sectionId: 's1',
      item: {
        id: 't1',
        title: 'Collect brief',
        isCompleted: true,
        contents: [{ type: 'form', value: '', fields: [plan, { id: 'name', label: 'Client', kind: 'text', required: false }] }],
      },
    }]);

    expect(entry).toEqual({
      kind: 'item',
      id: 't1',
      task: {
        id: 't1',
        title: 'Collect brief',
        isCompleted: true,
        subTasks: [],
        answers: [{ fieldId: 'plan', label: 'Plan', kind: 'select', answer: 'Pro' }],
      },
    });
  });
});
