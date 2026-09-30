import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { OutlineSidebar } from '@/components/template-editor/OutlineSidebar';
import { buildTemplateEditorFormValues, type TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import { findControls } from './accessibleMarkup';

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
    <FormProvider {...form}>
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
    </FormProvider>
  );
}

describe('OutlineSidebar', () => {
  it('renders the v0-style mode rail and outline column', () => {
    const html = renderToStaticMarkup(<SidebarHarness />);

    expect(html).toContain('Template Settings');
    expect(html).toContain('Search &amp; SEO');
    expect(html).toContain('Sections');
    expect(html).toContain('data-slot="template-outline"');
    expect(html).not.toContain('Setup');
  });
});

// Keyboard users tab onto the section and task actions; they must be visible when focused
// (and on touch screens), not only while the pointer hovers the row.
describe('OutlineSidebar row actions', () => {
  it('reveals the section and task actions on focus and without hover', () => {
    const html = renderToStaticMarkup(<SidebarHarness />);
    const reveal = ['group-focus-within:opacity-100', '[@media(hover:none)]:opacity-100'];

    const sectionActions = html.match(/<div class="([^"]*)"><button[^>]*aria-label="Add task to Before Day One"/);
    expect(sectionActions).not.toBeNull();
    for (const className of reveal) expect(sectionActions![1]).toContain(className);

    const taskRemove = findControls(html).find(
      (element) => element.attrs['aria-label'] === 'Remove Send welcome email',
    );
    expect(taskRemove).toBeDefined();
    for (const className of [...reveal, 'focus-visible:opacity-100']) {
      expect(taskRemove!.attrs.class).toContain(className);
    }
  });
});
