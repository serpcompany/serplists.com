import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { ContentEditor } from '@/components/template-editor/ContentEditor';
import { buildTemplateEditorFormValues, type TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import { findUnnamedControls, getByAccessibleName } from '../accessibleMarkup';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

function ContentHarness(): JSX.Element {
  const form = useForm<TemplateEditorFormValues>({
    defaultValues: buildTemplateEditorFormValues({
      sections: [
        {
          id: 'section-1',
          title: 'Prep',
          items: [
            {
              id: 'item-1',
              title: 'Pack',
              contents: [
                { id: 'content-1', type: 'text', value: 'Bring the badge' },
                {
                  id: 'content-2',
                  type: 'subItems',
                  value: '',
                  subItems: [
                    { id: 'sub-1', title: 'Laptop' },
                    { id: 'sub-2', title: 'Charger' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }),
  });

  return (
    <FormProvider {...form}>
      <ContentEditor itemIndex={0} sectionIndex={0} />
    </FormProvider>
  );
}

// Delete buttons announced only as 'button' could be pressed without knowing they
// delete content, and sub-task fields were named only by their placeholder.
describe('ContentEditor accessible names', () => {
  it('names every control in the content blocks', () => {
    const html = renderToStaticMarkup(<ContentHarness />);

    expect(findUnnamedControls(html)).toEqual([]);
  });

  it('names each block delete button after its block', () => {
    const html = renderToStaticMarkup(<ContentHarness />);

    expect(getByAccessibleName(html, 'Remove Text block')?.tag).toBe('button');
    expect(getByAccessibleName(html, 'Remove Sub-tasks block')?.tag).toBe('button');
  });

  it('names the text field and each sub-task field and delete button', () => {
    const html = renderToStaticMarkup(<ContentHarness />);

    expect(getByAccessibleName(html, 'Text Content')?.tag).toBe('textarea');
    expect(getByAccessibleName(html, 'Sub-task 1')?.attrs.value).toBe('Laptop');
    expect(getByAccessibleName(html, 'Sub-task 2')?.attrs.value).toBe('Charger');
    expect(getByAccessibleName(html, 'Remove sub-task 1')?.tag).toBe('button');
    expect(getByAccessibleName(html, 'Remove sub-task 2')?.tag).toBe('button');
  });
});

describe('ContentEditor block delete button', () => {
  // It sat at opacity 0 until hovered, so a keyboard user focused an invisible button.
  it('shows on keyboard focus and on touch screens', () => {
    const html = renderToStaticMarkup(<ContentHarness />);
    const remove = getByAccessibleName(html, 'Remove Text block');

    for (const className of [
      'group-focus-within:opacity-100',
      'focus-visible:opacity-100',
      '[@media(hover:none)]:opacity-100',
    ]) {
      expect(remove?.attrs.class).toContain(className);
    }
  });
});
