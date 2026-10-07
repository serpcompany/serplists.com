import { describe, expect, it } from 'vitest';

import type { PortableChecklistTemplate } from '@/lib/schemas/checklistSchema';
import { normalizePortableTemplate } from '@/lib/templates/portableTemplateNormalization';
import { parseTemplateMarkdown, renderTemplateMarkdown } from '@/lib/templates/templateMarkdown';
import { findInvalidImportSectionEntry } from '@/lib/utils/importSectionEntries';
import { parseTemplatesFromData, prepareTemplatesForImport } from '@/lib/utils/templateBackup';
import { stringMatching } from '../../../support/asymmetricMatchers';
import { contentAt, firstOf, taskAt } from '../../../support/elements';

const FENCE = '```';

const intakeTemplate = (): PortableChecklistTemplate => normalizePortableTemplate({
  title: 'Client intake',
  sections: [{
    title: 'Kickoff',
    items: [{
      title: 'Collect the brief',
      contents: [
        { type: 'text', value: 'Ask the client.' },
        {
          type: 'form',
          value: '',
          fields: [
            { id: 'field_name', label: '  Client name ', kind: 'text', required: true, description: ' As on the contract ' },
            { label: 'Plan', kind: 'select', options: [{ id: 'o1', label: 'Basic' }, { label: 'Pro' }] },
            { label: 'Seats', kind: 'number', required: false, min: 1, max: 50 },
            { label: 'Agree to terms', kind: 'checkbox', required: true },
          ],
        },
      ],
    }],
  }],
});

describe('a form block in the canonical portable form', () => {
  it('keeps each field without ids, with trimmed text and an explicit required flag', () => {
    expect(contentAt(taskAt(intakeTemplate(), 0, 0), 1)).toEqual({
      type: 'form',
      value: '',
      fields: [
        { label: 'Client name', kind: 'text', required: true, description: 'As on the contract' },
        { label: 'Plan', kind: 'select', required: false, options: [{ label: 'Basic' }, { label: 'Pro' }] },
        { label: 'Seats', kind: 'number', required: false, min: 1, max: 50 },
        { label: 'Agree to terms', kind: 'checkbox', required: true },
      ],
    });
  });

  it('renders as a fenced serplists:form YAML block and imports back as the same template', () => {
    const template = intakeTemplate();
    const markdown = renderTemplateMarkdown(template);

    expect(markdown).toContain([
      `${FENCE}serplists:form`,
      '- label: Client name',
      '  kind: text',
      '  required: true',
      '  description: As on the contract',
      '- label: Plan',
      '  kind: select',
      '  options:',
      '    - Basic',
      '    - Pro',
    ].join('\n'));
    expect(parseTemplateMarkdown(markdown)).toEqual(template);
  });

  it('reads options given as objects with a label, and refuses a form block that is not a list of fields', () => {
    const markdown = (body: string) => [
      '---', 'title: Intake', '---', '# Intake', '', '## Kickoff', '', '### Brief', '',
      `${FENCE}serplists:form`, body, FENCE, '',
    ].join('\n');

    const parsed = parseTemplateMarkdown(markdown('- label: Plan\n  kind: multiSelect\n  options:\n    - label: A\n    - B'));
    expect(contentAt(taskAt(parsed, 0, 0), 0)).toEqual({
      type: 'form',
      value: '',
      fields: [{ label: 'Plan', kind: 'multiSelect', required: false, options: [{ label: 'A' }, { label: 'B' }] }],
    });
    expect(() => parseTemplateMarkdown(markdown('label: Plan'))).toThrow('Form block must be a YAML array of fields');
    expect(() => parseTemplateMarkdown(markdown('- Plan'))).toThrow('Form block entries must be objects with a label and a kind');
    expect(() => parseTemplateMarkdown(markdown('- label: Plan\n  kind: select'))).toThrow(/at least one option/);
  });
});

describe('importing a template with a form', () => {
  const imported = () => {
    const { templates } = parseTemplatesFromData([{
      title: 'Intake',
      sections: [{ id: 's1', title: 'Kickoff', items: [{ id: 'i1', title: 'Brief', isCompleted: true, contents: [{
        id: 'c1',
        type: 'form',
        value: '',
        fields: [
          { id: 'field_old', label: 'Client', kind: 'text', required: true, answer: 'Acme' },
          { id: 'field_plan', label: 'Plan', kind: 'select', options: [{ id: 'o1', label: 'Pro' }], answer: 'o1' },
        ],
      }] }] }],
    }]);
    return prepareTemplatesForImport(templates, 'user-1');
  };

  it('gives every field a new id, keeps option ids and clears answers', () => {
    const fields = contentAt(taskAt(firstOf(imported()), 0, 0), 0).fields ?? [];

    expect(fields.map((field) => field.id)).toEqual([stringMatching(/^field_/), stringMatching(/^field_/)]);
    expect(fields.map((field) => field.id)).not.toContain('field_old');
    expect(fields.map((field) => field.answer)).toEqual([undefined, undefined]);
    expect(fields[1]?.options).toEqual([{ id: 'o1', label: 'Pro' }]);
  });

  it('names a form field that is not an object', () => {
    expect(findInvalidImportSectionEntry([{ title: 'S', items: [{ title: 'Brief', contents: [{ type: 'form', fields: [{ label: 'A', kind: 'text' }, 'x'] }] }] }]))
      .toBe('form field 2 of task "Brief" must be an object with a label and a kind');
  });
});
