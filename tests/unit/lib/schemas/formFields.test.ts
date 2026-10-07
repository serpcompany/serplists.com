import { describe, expect, it } from 'vitest';

import {
  readFormFields,
  sanitizeStoredFormFields,
  storedFormFieldSchema,
  withFormOptionIds,
  withoutFormAnswers,
} from '@/lib/schemas/formFields';
import { findStoredSectionsIssue, getTaskFormFields, isFormBlock } from '@/lib/schemas/storedSections';

const fallbackId = (index: number) => `i1-field-${index + 1}`;

describe('stored form fields', () => {
  it('accepts every kind with an answer of its own shape, or none', () => {
    const fields = [
      { id: 'a', label: 'Name', kind: 'text', required: true, answer: 'Acme' },
      { id: 'b', label: 'Notes', kind: 'longText', required: false },
      { id: 'c', label: 'Site', kind: 'url', answer: null },
      { id: 'd', label: 'Email', kind: 'email', answer: 'not checked here' },
      { id: 'e', label: 'Seats', kind: 'number', min: 1, max: 9, answer: 3.5 },
      { id: 'f', label: 'Start', kind: 'date', answer: '2026-10-06' },
      { id: 'g', label: 'Plan', kind: 'select', options: [{ id: 'o1', label: 'Pro' }], answer: 'o1' },
      { id: 'h', label: 'Tags', kind: 'multiSelect', options: [{ id: 'o1', label: 'A' }], answer: [] },
      { id: 'i', label: 'Agree', kind: 'checkbox', answer: false },
      { id: 'j', label: 'Brief', kind: 'file', answer: { url: '/api/uploads/file?key=a', fileName: 'a.pdf', fileSize: 3 } },
    ];

    for (const field of fields) expect(storedFormFieldSchema.safeParse(field).success, field.kind).toBe(true);
    expect(findStoredSectionsIssue([{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents: [
      { id: 'c1', type: 'form', value: '', fields },
    ] }] }])).toBeNull();
  });

  it('names the path of a field whose answer has the wrong shape', () => {
    expect(findStoredSectionsIssue([{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'T', contents: [
      { id: 'c1', type: 'form', value: '', fields: [{ id: 'f', label: 'Count', kind: 'number', answer: 'five' }] },
    ] }] }])).toBe('sections[0].items[0].contents[0].fields[0].answer: Expected number, received string');
  });

  it('sanitizes fields: drops unknown kinds and stray keys, fixes types and keeps answers that fit their kind', () => {
    expect(sanitizeStoredFormFields([
      'x',
      { id: 'a', label: 'Color', kind: 'color' },
      { id: 'b', label: 7, kind: 'text', required: 'yes', options: [{ id: 'o', label: 'O' }], min: 1, answer: 5, extra: true },
      { id: 'c', label: 'Seats', kind: 'number', min: '1', max: 9, answer: 4 },
      { id: 'd', label: 'Plan', kind: 'select', options: 'x', answer: 'o1' },
      { id: 'e', label: 'Brief', kind: 'file', description: {}, answer: { fileName: 'a.pdf' } },
    ])).toEqual([
      { id: 'b', label: '', kind: 'text', required: false, extra: true },
      { id: 'c', label: 'Seats', kind: 'number', required: false, max: 9, answer: 4 },
      { id: 'd', label: 'Plan', kind: 'select', required: false, options: [], answer: 'o1' },
      { id: 'e', label: 'Brief', kind: 'file', required: false },
    ]);
  });

  it('reads typed fields with fallback ids for fields and options that have none', () => {
    expect(readFormFields([
      { label: 'Plan', kind: 'select', required: true, options: [{ label: 'Basic' }, { id: 'pro', label: 'Pro' }], answer: 'pro' },
      { id: 'brief', label: 'Brief', kind: 'file', answer: { url: '/api/uploads/file?key=a' } },
      { id: 'tags', label: 'Tags', kind: 'multiSelect', options: [{ id: 'a', label: 'A' }], answer: ['a'] },
    ], fallbackId)).toEqual([
      {
        id: 'i1-field-1',
        label: 'Plan',
        kind: 'select',
        required: true,
        options: [{ id: 'option-1', label: 'Basic' }, { id: 'pro', label: 'Pro' }],
        answer: 'pro',
      },
      { id: 'brief', label: 'Brief', kind: 'file', required: false, answer: { url: '/api/uploads/file?key=a', fileName: '', fileSize: 0 } },
      { id: 'tags', label: 'Tags', kind: 'multiSelect', required: false, options: [{ id: 'a', label: 'A' }], answer: ['a'] },
    ]);
  });

  it('gives options without an id, or with a repeated one, a positional id that stays the same', () => {
    const options = [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }, { label: 'C' }, { id: 'option-2', label: 'D' }];

    const once = withFormOptionIds(options);
    expect(once.map((option) => option.id)).toEqual(['a', 'option-2', 'option-3', 'option-4']);
    expect(withFormOptionIds(once)).toEqual(once);
  });

  it('clears answers without touching the definitions', () => {
    expect(withoutFormAnswers([{ id: 'a', kind: 'text', label: 'Name', answer: 'x' }, 'x'])).toEqual([
      { id: 'a', kind: 'text', label: 'Name' },
      'x',
    ]);
    expect(withoutFormAnswers('x')).toEqual([]);
  });
});

describe('form blocks in a task', () => {
  it('finds the fields of every form block and ignores fields on other blocks', () => {
    const task = {
      id: 'i1',
      contents: [
        { type: 'form', fields: [{ id: 'a' }, { id: 'b' }] },
        { type: 'text', value: '', fields: [{ id: 'stray' }] },
        { type: 'form', fields: [{ id: 'c' }] },
      ],
    };

    expect(getTaskFormFields(task).map((field) => field.id)).toEqual(['a', 'b', 'c']);
    expect(isFormBlock({ type: 'form' })).toBe(true);
    expect(isFormBlock({ type: 'subItems' })).toBe(false);
  });
});
