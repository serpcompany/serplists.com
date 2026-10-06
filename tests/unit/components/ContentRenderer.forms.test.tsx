import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import { PublicTemplateContent } from '@/components/template/PublicTemplateContent';
import type { ChecklistFormField, ChecklistItemContent } from '@/types/checklist';

const FIELDS: ChecklistFormField[] = [
  { id: 'field-name', label: 'Client name', kind: 'text', required: true, description: 'As on the contract' },
  {
    id: 'field-plan',
    label: 'Plan',
    kind: 'select',
    required: false,
    options: [{ id: 'option-free', label: 'Free' }, { id: 'option-pro', label: 'Pro' }],
  },
];

const formBlock = (fields: ChecklistFormField[] = FIELDS): ChecklistItemContent => ({ id: 'form-1', type: 'form', value: '', fields });

const textOf = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('a Form block shown read-only on the Template pages, the editor preview and a shared run', () => {
  it('lists each field with its label, type, Required mark, help text and options, and offers no input', () => {
    const html = renderToStaticMarkup(<ContentRenderer contents={[formBlock()]} disabled subtaskHeadingAs="h3" />);
    const text = textOf(html);

    expect(html).toContain('<h3 class="font-medium">Form</h3>');
    expect(text).toContain('Client name Short text Required');
    expect(text).toContain('As on the contract');
    expect(text).toContain('Plan Dropdown');
    expect(text).not.toContain('Plan Dropdown Required');
    expect(text).toContain('Free');
    expect(text).toContain('Pro');
    expect(html).not.toMatch(/<(input|textarea|select)\b/);
    expect(text).not.toContain('Answer:');
  });

  it("shows a run's answers by option label, and an uploaded file as a link that opens in a new tab", () => {
    const html = renderToStaticMarkup(
      <ContentRenderer
        contents={[formBlock([
          { id: 'field-name', label: 'Client name', kind: 'text', required: true, answer: 'Acme' },
          { id: 'field-plan', label: 'Plan', kind: 'select', required: false, options: [{ id: 'option-pro', label: 'Pro' }], answer: 'option-pro' },
          {
            id: 'field-brief',
            label: 'Brief',
            kind: 'file',
            required: false,
            answer: { url: '/api/uploads/file?key=template-files/brief.pdf', fileName: 'brief.pdf', fileSize: 10 },
          },
        ])]}
        disabled
      />,
    );
    const text = textOf(html);

    expect(text).toContain('Answer: Acme');
    expect(text).toContain('Answer: Pro');
    expect(html).toContain('href="/api/uploads/file?key=template-files/brief.pdf"');
    expect(html).toContain('target="_blank"');
    expect(text).toContain('brief.pdf');
  });

  it('shows nothing for a Form block whose fields could not be read', () => {
    const html = renderToStaticMarkup(
      <ContentRenderer contents={[{ id: 'form-1', type: 'form', value: '', fields: [] }]} disabled />,
    );

    expect(html).not.toContain('Form');
  });

  it('shows the same list in the editor preview, under the task', () => {
    const html = renderToStaticMarkup(
      <PublicTemplateContent
        initialExpandedItems={{ '0-0': true }}
        sections={[{ id: 'intake', title: 'Intake', items: [{ id: 'task-1', title: 'Collect details', contents: [formBlock()] }] }]}
      />,
    );
    const text = textOf(html);

    expect(text).toContain('Form');
    expect(text).toContain('Client name Short text Required');
    expect(text).toContain('As on the contract');
    expect(text).toContain('Free');
    expect(html).not.toMatch(/<textarea\b|<input\b[^>]*type="(text|url|email|number|date|file)"/);
  });
});
