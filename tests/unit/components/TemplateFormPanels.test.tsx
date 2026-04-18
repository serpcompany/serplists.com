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

    expect(html).toContain('Template Settings');
    expect(html).toContain('Template Name');
    expect(html).toContain('Goal / Summary');
    expect(html).toContain('Template Type');
    expect(html).toContain('Categories');
    expect(html).toContain('Public Template');
  });

  it('renders the SEO pane as a search preview form', () => {
    const html = renderToStaticMarkup(
      <TemplateFormHarness>
        <SEOMetaEditor />
      </TemplateFormHarness>,
    );

    expect(html).toContain('Search &amp; SEO');
    expect(html).toContain('Search Title');
    expect(html).toContain('URL Slug');
    expect(html).toContain('Search Description');
    expect(html).toContain('Preview');
    expect(html).toContain('example.com/templates/');
  });
});
