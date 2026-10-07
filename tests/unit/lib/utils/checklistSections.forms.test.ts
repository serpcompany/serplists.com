import { describe, expect, it } from 'vitest';

import { calculateSectionsProgress, normalizeSections, resetSectionsCompletion } from '@/lib/utils/checklistSections';
import { contentAt, taskIn } from '../../../support/elements';

const storedRun = (fields: unknown, extra: Record<string, unknown> = {}) => [{
  id: 's1',
  title: 'Kickoff',
  items: [{ id: 'i1', title: 'Brief', isCompleted: true, contents: [{ id: 'c1', type: 'form', value: '', fields, ...extra }] }],
}];

describe('form blocks on the run page', () => {
  it('reads typed fields with their answers, and ids for fields and options that have none', () => {
    const sections = normalizeSections(storedRun([
      { id: 'field_a', label: 'Plan', kind: 'select', required: true, options: [{ id: 'o1', label: 'Pro' }, { label: 'Basic' }], answer: 'o1' },
      { label: 'Seats', kind: 'number', min: 1, answer: 'three' },
      { label: 'Color', kind: 'color' },
    ]));

    expect(contentAt(taskIn(sections, 0, 0), 0)).toEqual({
      id: 'c1',
      type: 'form',
      value: '',
      fields: [
        {
          id: 'field_a',
          label: 'Plan',
          kind: 'select',
          required: true,
          options: [{ id: 'o1', label: 'Pro' }, { id: 'option-2', label: 'Basic' }],
          answer: 'o1',
        },
        { id: 'i1-form-1-field-2', label: 'Seats', kind: 'number', required: false, min: 1 },
      ],
    });
  });

  it('turns a malformed field list into an empty one and drops fields from other blocks', () => {
    const [form] = taskIn(normalizeSections(storedRun('x')), 0, 0).contents ?? [];
    expect(form?.fields).toEqual([]);

    const text = contentAt(taskIn(normalizeSections(storedRun([{ id: 'f', label: 'L', kind: 'text' }], { type: 'text' })), 0, 0), 0);
    expect(text.fields).toBeUndefined();
  });

  it('does not count fields toward progress', () => {
    const sections = normalizeSections(storedRun([{ id: 'f', label: 'Name', kind: 'text', required: true }]));
    expect(calculateSectionsProgress(sections)).toBe(100);
  });

  it('clears answers, and keeps the definitions, when a run starts over', () => {
    const sections = normalizeSections(storedRun([
      { id: 'f1', label: 'Name', kind: 'text', required: true, answer: 'Acme' },
      { id: 'f2', label: 'Agree', kind: 'checkbox', answer: true },
    ]));

    expect(contentAt(taskIn(resetSectionsCompletion(sections), 0, 0), 0).fields).toEqual([
      { id: 'f1', label: 'Name', kind: 'text', required: true },
      { id: 'f2', label: 'Agree', kind: 'checkbox', required: false },
    ]);
  });
});
