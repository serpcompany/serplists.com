import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormProvider, useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { SectionEditor } from '@/components/template-editor/SectionEditor';
import { SEOMetaEditor } from '@/components/template-editor/SEOMetaEditor';
import { TemplateBasicInfo } from '@/components/template-editor/TemplateBasicInfo';
import {
  buildTemplateEditorDetailsFormValues,
  type TemplateEditorDetailsFormValues,
} from '@/lib/forms/templateEditorDetailsForm';
import { buildTemplateEditorFormValues, type TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

import {
  accessibleDescription,
  findLabelsNotBoundToOneElement,
  findDuplicateIds,
  findUnnamedControls,
  getByAccessibleName,
} from './accessibleMarkup';

function TemplateFormHarness(props: {
  children: React.ReactNode;
  tags?: string[];
}): React.JSX.Element {
  const form = useForm<TemplateEditorDetailsFormValues>({
    defaultValues: { ...buildTemplateEditorDetailsFormValues(), tags: props.tags ?? [] },
  });

  return <FormProvider {...form}>{props.children}</FormProvider>;
}

function SectionFormHarness(props: { children: React.ReactNode }): React.JSX.Element {
  const form = useForm<TemplateEditorFormValues>({
    defaultValues: buildTemplateEditorFormValues({
      sections: [
        { id: 'section-1', title: 'Prep', items: [] },
        { id: 'section-2', title: 'Launch', items: [] },
      ],
    }),
  });

  return <FormProvider {...form}>{props.children}</FormProvider>;
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
  });
});

describe('Search & SEO preview URL', () => {
  function SeoHarness(props: {
    children: React.ReactNode;
    values: Partial<TemplateEditorDetailsFormValues>;
  }): React.JSX.Element {
    const form = useForm<TemplateEditorDetailsFormValues>({
      defaultValues: { ...buildTemplateEditorDetailsFormValues(), ...props.values },
    });

    return <FormProvider {...form}>{props.children}</FormProvider>;
  }

  it('previews the slug at the public template URL, /profile/<username>/<slug>, never a /templates/ route the app does not have', () => {
    const html = renderToStaticMarkup(
      <SeoHarness values={{ seoUrl: 'launch-checklist' }}>
        <SEOMetaEditor ownerSlug="jane" />
      </SeoHarness>,
    );

    expect(html).toContain('https://serplists.com/profile/jane/launch-checklist');
    expect(html).not.toContain('example.com');
    expect(html).not.toContain('/templates/');
  });

  it('previews the slug a new template gets from its name when the slug is blank, never "untitled"', () => {
    const html = renderToStaticMarkup(
      <SeoHarness values={{ seoUrl: '', title: 'Launch Checklist!' }}>
        <SEOMetaEditor ownerSlug="jane" />
      </SeoHarness>,
    );

    expect(html).toContain('/profile/jane/launch-checklist');
    expect(html).not.toContain('untitled');
  });

  it('says a username is needed when the owner has none', () => {
    const html = renderToStaticMarkup(
      <SeoHarness values={{ seoUrl: 'launch-checklist' }}>
        <SEOMetaEditor ownerSlug={null} />
      </SeoHarness>,
    );

    expect(html).toContain('needs a username');
    expect(html).not.toContain('/profile/');
    expect(html).not.toContain('/templates/');
  });

  it('says a private template has no live public page', () => {
    const html = renderToStaticMarkup(
      <SeoHarness values={{ seoUrl: 'launch-checklist', isPublic: false }}>
        <SEOMetaEditor ownerSlug="jane" />
      </SeoHarness>,
    );

    expect(html).toContain('This template is private');
  });
});

describe('Template form panels name every control for screen readers', () => {
  it('links each Template Settings label to its control, so no field falls back to its placeholder and the tag remove button is not a bare "button"', () => {
    const html = renderToStaticMarkup(
      <TemplateFormHarness tags={['onboarding']}>
        <TemplateBasicInfo />
      </TemplateFormHarness>,
    );

    expect(findUnnamedControls(html)).toEqual([]);
    expect(findLabelsNotBoundToOneElement(html)).toEqual([]);
    expect(getByAccessibleName(html, 'Template Name')?.tag).toBe('input');
    expect(getByAccessibleName(html, 'Goal / Summary')?.tag).toBe('textarea');
    expect(getByAccessibleName(html, 'Template Type')?.attrs.role).toBe('combobox');
    expect(getByAccessibleName(html, 'Categories')?.attrs.role).toBe('combobox');
    expect(getByAccessibleName(html, 'Tags')?.tag).toBe('input');
    expect(getByAccessibleName(html, 'Remove tag onboarding')?.tag).toBe('button');
  });

  it('names the Public Template switch, which publishes the template, and describes what it does, not just "switch, on"', () => {
    const html = renderToStaticMarkup(
      <TemplateFormHarness>
        <TemplateBasicInfo />
      </TemplateFormHarness>,
    );

    const publicSwitch = getByAccessibleName(html, 'Public Template');
    expect(publicSwitch?.attrs.role).toBe('switch');
    expect(accessibleDescription(html, publicSwitch!)).toBe(
      'Make this template visible in the Template Library',
    );
  });

  it('links each Search & SEO label and hint to its field', () => {
    const html = renderToStaticMarkup(
      <TemplateFormHarness>
        <SEOMetaEditor />
      </TemplateFormHarness>,
    );

    expect(findUnnamedControls(html)).toEqual([]);
    expect(findLabelsNotBoundToOneElement(html)).toEqual([]);
    const searchTitle = getByAccessibleName(html, 'Search Title');
    const slug = getByAccessibleName(html, 'URL Slug');
    expect(searchTitle?.tag).toBe('input');
    expect(slug?.tag).toBe('input');
    expect(getByAccessibleName(html, 'Search Description')?.tag).toBe('textarea');
    expect(accessibleDescription(html, searchTitle!)).toBe('Leave blank to use the template name');
    expect(accessibleDescription(html, slug!)).toBe('The URL-friendly identifier for this template');
  });

  it('links the Section Title label, with ids unique across panels shown together', () => {
    const html = renderToStaticMarkup(
      <SectionFormHarness>
        <TemplateBasicInfo />
        <SEOMetaEditor />
        <SectionEditor sectionIndex={0} />
        <SectionEditor sectionIndex={1} />
      </SectionFormHarness>,
    );

    expect(findUnnamedControls(html)).toEqual([]);
    expect(findLabelsNotBoundToOneElement(html)).toEqual([]);
    expect(findDuplicateIds(html)).toEqual([]);
    expect(getByAccessibleName(html, 'Section Title')?.attrs.value).toBe('Prep');
  });
});
