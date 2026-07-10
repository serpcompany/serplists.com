import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { OutlineSidebar } from '@/components/template-editor/OutlineSidebar';
import { Form } from '@/components/ui/form';
import { buildTemplateEditorFormValues, type TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

function SidebarHarness(): JSX.Element {
  const form = useForm<TemplateEditorFormValues>({
    defaultValues: buildTemplateEditorFormValues({
      sections: [
        {
          id: 'section-1',
          title: 'Before Day One',
          items: [
            {
              id: 'item-1',
              title: 'Send welcome email',
              contents: [],
            },
          ],
        },
      ],
    }),
  });

  return (
    <Form {...form}>
      <OutlineSidebar
        selectedItemIndex={null}
        selectedSectionIndex={0}
        showingSEO={false}
        showingTemplateInfo
        onSelectItem={vi.fn()}
        onSelectSEO={vi.fn()}
        onSelectSection={vi.fn()}
        onSelectTemplateInfo={vi.fn()}
      />
    </Form>
  );
}

describe('OutlineSidebar', () => {
  it('renders the v0-style mode rail and outline column', () => {
    const html = renderToStaticMarkup(<SidebarHarness />);

    expect(html).toContain('Template Settings');
    expect(html).toContain('Search &amp; SEO');
    expect(html).toContain('Sections');
    expect(html).toContain('bg-sidebar');
    expect(html).not.toContain('Setup');
  });
});
