import { describe, expect, it } from 'vitest';

import type { ChecklistFormField, FormAnswer, FormFieldKind } from '@/types/checklist';
import {
  findFormFieldProblem,
  findFormFieldProblems,
  formatFormAnswer,
  formFieldProblemMessage,
  isFormAnswerEmpty,
} from '@/lib/schemas/formValidation';
import { FORM_FIELD_KINDS, MAX_FORM_TEXT_ANSWER_LENGTH } from '@/lib/schemas/formFields';

const options = [{ id: 'basic', label: 'Basic' }, { id: 'pro', label: 'Pro' }];
const uploadUrl = 'https://serplists.com/api/uploads/file?key=template-files%2Fu1%2Fa.pdf';

const field = (kind: FormFieldKind, extra: Partial<ChecklistFormField> = {}): ChecklistFormField => ({
  id: `field_${kind}`,
  label: kind,
  kind,
  required: false,
  ...(kind === 'select' || kind === 'multiSelect' ? { options } : {}),
  ...extra,
});

const VALID_ANSWERS: Record<FormFieldKind, FormAnswer> = {
  text: 'Acme Ltd',
  longText: 'Line one\nLine two',
  url: 'https://example.com/brief',
  email: 'ops@example.com',
  number: 42,
  date: '2026-02-28',
  select: 'pro',
  multiSelect: ['basic', 'pro'],
  checkbox: true,
  file: { url: uploadUrl, fileName: 'a.pdf', fileSize: 1200 },
};

const INVALID_ANSWERS: Array<[string, FormFieldKind, FormAnswer, Partial<ChecklistFormField>?]> = [
  ['text over 500 characters', 'text', 'x'.repeat(MAX_FORM_TEXT_ANSWER_LENGTH.text + 1)],
  ['long text over 10,000 characters', 'longText', 'x'.repeat(MAX_FORM_TEXT_ANSWER_LENGTH.longText + 1)],
  ['a URL that is not http or https', 'url', 'ftp://example.com/file'],
  ['a script URL', 'url', 'javascript:alert(1)'],
  ['a URL over 2,048 characters', 'url', `https://example.com/${'a'.repeat(2048)}`],
  ['an email without an @', 'email', 'ops.example.com'],
  ['an email without a domain dot', 'email', 'ops@example'],
  ['an email over 254 characters', 'email', `${'a'.repeat(250)}@example.com`],
  ['a number below the minimum', 'number', -1, { min: 0 }],
  ['a number above the maximum', 'number', 11, { max: 10 }],
  ['a date that does not exist', 'date', '2026-02-30'],
  ['a date in another format', 'date', '28/02/2026'],
  ['an option that does not exist', 'select', 'enterprise'],
  ['a multiple choice with a missing option', 'multiSelect', ['basic', 'enterprise']],
  ['a file without an upload URL', 'file', { url: 'https://example.com/a.pdf', fileName: 'a.pdf', fileSize: 1 }],
  ['an answer of another kind', 'text', 5],
];

describe('findFormFieldProblem, the one rule for whether a form field blocks its task', () => {
  it.each(FORM_FIELD_KINDS)('accepts a valid %s answer on a required field', (kind) => {
    expect(findFormFieldProblem(field(kind, { required: true, answer: VALID_ANSWERS[kind] }))).toBeNull();
  });

  it.each(FORM_FIELD_KINDS)('reports a required %s field with no answer', (kind) => {
    expect(findFormFieldProblem(field(kind, { required: true }))).toBe('required');
  });

  it.each(FORM_FIELD_KINDS)('lets an optional %s field stay empty', (kind) => {
    expect(findFormFieldProblem(field(kind))).toBeNull();
  });

  it.each(INVALID_ANSWERS)('reports %s as invalid, required or not', (_label, kind, answer, extra = {}) => {
    expect(findFormFieldProblem(field(kind, { ...extra, answer }))).toBe('invalid');
    expect(findFormFieldProblem(field(kind, { ...extra, answer, required: true }))).toBe('invalid');
  });

  it('treats a missing answer, blank text, an empty choice and an unchecked box as empty', () => {
    for (const answer of [undefined, null, '', '   ', [], false]) expect(isFormAnswerEmpty(answer)).toBe(true);
    for (const answer of ['x', 0, ['a'], true, { url: uploadUrl }]) expect(isFormAnswerEmpty(answer)).toBe(false);
    expect(findFormFieldProblem(field('checkbox', { required: true, answer: false }))).toBe('required');
    expect(findFormFieldProblem(field('text', { required: true, answer: '  ' }))).toBe('required');
  });

  it('accepts numbers at their bounds and zero', () => {
    expect(findFormFieldProblem(field('number', { min: 0, max: 10, answer: 0 }))).toBeNull();
    expect(findFormFieldProblem(field('number', { min: 0, max: 10, answer: 10 }))).toBeNull();
    expect(findFormFieldProblem(field('number', { required: true, answer: 0 }))).toBeNull();
  });

  it('accepts text at its length limit, a leap day and a relative upload URL', () => {
    expect(findFormFieldProblem(field('text', { answer: 'x'.repeat(MAX_FORM_TEXT_ANSWER_LENGTH.text) }))).toBeNull();
    expect(findFormFieldProblem(field('date', { answer: '2028-02-29' }))).toBeNull();
    expect(findFormFieldProblem(field('file', { answer: { url: '/api/uploads/file?key=a.pdf', fileName: 'a.pdf', fileSize: 1 } }))).toBeNull();
  });

  it('checks an answer against option ids, so a renamed option keeps it', () => {
    const renamed = field('select', { options: [{ id: 'pro', label: 'Professional' }], answer: 'pro' });
    expect(findFormFieldProblem(renamed)).toBeNull();
  });

  it.each(['select', 'multiSelect'] as const)('never blocks its task on a required %s field with no options, which no one could answer', (kind) => {
    expect(findFormFieldProblem(field(kind, { required: true, options: [] }))).toBeNull();
    expect(findFormFieldProblem(field(kind, { required: true, options: undefined }))).toBeNull();
  });

  it('ignores a field whose kind it does not know', () => {
    expect(findFormFieldProblem({ id: 'f', kind: 'color', required: true })).toBeNull();
  });
});

describe('findFormFieldProblems', () => {
  it('lists every blocking field of every form block in the task, and nothing else', () => {
    const task = {
      id: 'i1',
      title: 'Kickoff',
      contents: [
        { id: 'c1', type: 'text', value: 'Intro' },
        { id: 'c2', type: 'form', value: '', fields: [field('text', { required: true }), field('email', { answer: 'nope' })] },
        { id: 'c3', type: 'form', value: '', fields: [field('number', { required: true, answer: 3 })] },
        { id: 'c4', type: 'subItems', value: '', fields: [field('date', { required: true })] },
      ],
    };

    expect(findFormFieldProblems(task)).toEqual([
      { fieldId: 'field_text', reason: 'required' },
      { fieldId: 'field_email', reason: 'invalid' },
    ]);
  });

  it('finds nothing in a task without a form', () => {
    expect(findFormFieldProblems({ id: 'i1', title: 'Plain' })).toEqual([]);
  });
});

describe('form field messages and answer text', () => {
  it('tells the person what to do for each kind', () => {
    expect(formFieldProblemMessage(field('select'), 'required')).toBe('Choose an option.');
    expect(formFieldProblemMessage(field('email'), 'invalid')).toBe('Enter an email address like name@example.com.');
    expect(formFieldProblemMessage(field('number', { min: 1, max: 5 }), 'invalid')).toBe('Enter a number from 1 to 5.');
    expect(formFieldProblemMessage(field('number', { min: 1 }), 'invalid')).toBe('Enter a number of at least 1.');
    expect(formFieldProblemMessage(field('text'), 'invalid')).toBe('Use 500 characters or fewer.');
  });

  it('shows options by label, files by name and an empty answer as nothing', () => {
    expect(formatFormAnswer(field('multiSelect', { answer: ['pro', 'basic'] }))).toBe('Pro, Basic');
    expect(formatFormAnswer(field('select', { answer: 'gone' }))).toBe('gone');
    expect(formatFormAnswer(field('file', { answer: VALID_ANSWERS.file }))).toBe('a.pdf');
    expect(formatFormAnswer(field('checkbox', { answer: true }))).toBe('Checked');
    expect(formatFormAnswer(field('number', { answer: 0 }))).toBe('0');
    expect(formatFormAnswer(field('text'))).toBe('');
  });
});
