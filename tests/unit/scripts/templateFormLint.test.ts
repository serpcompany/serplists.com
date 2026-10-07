import { describe, expect, it, vi } from 'vitest';

import { findTemplateFormIssues } from '@/../scripts/lib/templateFormLint';
import { lintSingleTemplateSource } from '@/../scripts/lib/templateLint';
import type { PortableChecklistTemplate } from '@/lib/schemas/checklistSchema';
import { firstOf } from '../../support/elements';

const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
}));

type FormContent = Extract<NonNullable<PortableChecklistTemplate['sections'][number]['items'][number]['contents']>[number], { type: 'form' }>;

const withForm = (fields: FormContent['fields']): PortableChecklistTemplate => ({
  title: 'Intake',
  sections: [{ title: 'Kickoff', items: [{ title: 'Brief', contents: [{ type: 'text', value: 'Hi' }, { type: 'form', value: '', fields }] }] }],
});

describe('template lint rules for form blocks, a second check behind the portable schema', () => {
  it('flags an empty form, a blank label and a choice field without options', () => {
    expect(findTemplateFormIssues(withForm([]))).toEqual([
      { code: 'empty-form', message: 'Item 1.1 content block 2 (form) must include at least one field' },
    ]);
    expect(findTemplateFormIssues(withForm([
      { label: ' ', kind: 'text' },
      { label: 'Plan', kind: 'select', options: [] },
      { label: 'Tags', kind: 'multiSelect', options: [{ label: 'A' }] },
    ]))).toEqual([
      { code: 'blank-form-field-label', message: 'Item 1.1 content block 2 form field 1 needs a label' },
      { code: 'form-field-without-options', message: 'Item 1.1 content block 2 form field 2 (select) needs at least one option' },
    ]);
  });

  it('reports a source the schema refuses for the same reason as a parse error naming it', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({
      title: 'Intake',
      sections: [{ title: 'Kickoff', items: [{ title: 'Brief', contents: [{ type: 'form', fields: [{ label: 'Plan', kind: 'select' }] }] }] }],
    }));

    const issue = firstOf(await lintSingleTemplateSource('/repo/template.json'));
    expect(issue.code).toBe('parse-error');
    expect(issue.message).toMatch(/Dropdown and multiple choice fields need at least one option/);
  });
});
