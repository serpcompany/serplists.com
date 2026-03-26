import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { Form } from '@/components/ui/form';
import { SEOMetaEditor } from '@/components/template-editor/SEOMetaEditor';
import { TemplateBasicInfo } from '@/components/template-editor/TemplateBasicInfo';
import {
  buildTemplateEditorDetailsFormValues,
  type TemplateEditorDetailsFormValues,
} from '@/lib/forms/templateEditorDetailsForm';

function TemplateFormHarness(props: {
  children: React.ReactNode;
}): JSX.Element {
  const form = useForm<TemplateEditorDetailsFormValues>({
    defaultValues: buildTemplateEditorDetailsFormValues(),
  });

  return <Form {...form}>{props.children}</Form>;
}

describe('Template form panels', () => {
  it('renders the template metadata pane as a focused template form', () => {
    const html = renderToStaticMarkup(
      <TemplateFormHarness>
        <TemplateBasicInfo />
      </TemplateFormHarness>,
    );

    expect(html).toContain('Identity');
    expect(html).toContain('Template name');
    expect(html).toContain('Goal / summary');
    expect(html).toContain('Access');
    expect(html).toContain('Organization');
  });

  it('renders the SEO pane as a search preview form', () => {
    const html = renderToStaticMarkup(
      <TemplateFormHarness>
        <SEOMetaEditor />
      </TemplateFormHarness>,
    );

    expect(html).toContain('Search preview');
    expect(html).toContain('Search title');
    expect(html).toContain('URL slug');
    expect(html).toContain('Search description');
  });
});
