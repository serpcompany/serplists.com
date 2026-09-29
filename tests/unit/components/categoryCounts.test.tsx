import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
} from '@/components/checklist-library/discovery-utils';
import { uniqueCategoryNames } from '@/lib/categorySlug';
import { normalizeTemplateEditorDetailsForSave } from '@/lib/forms/templateEditorDetailsForm';
import { parseTemplatesFromJSON } from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// A template listing one category twice, as "SEO" and "seo" or "QA" and "Q&A" (same slug),
// counted twice: /categories said "SEO - 2 templates" while the SEO page listed one. Imports
// and direct API calls can store such lists; the editor's picker cannot.

const template = (id: string, categories: string[]): ChecklistTemplate => ({
  categories,
  createdAt: '2026-03-24T00:00:00.000Z',
  id,
  isPublic: true,
  ownerProfile: { username: 'alice' },
  sections: [],
  slug: id,
  title: `Template ${id}`,
  updatedAt: '2026-03-24T00:00:00.000Z',
  userId: 'user-1',
});

const templates = [
  template('case-variants', ['SEO', 'seo', ' SEO ']),
  template('punctuation-variants', ['Q&A', 'QA']),
  template('exact-duplicates', ['Ops', 'Ops']),
  template('no-slug', ['&&', '!!!', 'Ops']),
  template('plain', ['SEO', 'Travel']),
];

describe('category counts', () => {
  it('count each template once per category, however often it lists it', () => {
    const categories = buildDiscoveryCategories(templates);
    const bySlug = new Map(categories.map((category) => [category.slug, category]));

    expect(bySlug.get('seo')).toEqual({ count: 2, name: 'SEO', slug: 'seo' });
    expect(bySlug.get('qa')).toEqual({ count: 1, name: 'Q&A', slug: 'qa' });
    expect(bySlug.get('ops')).toEqual({ count: 2, name: 'Ops', slug: 'ops' });
    expect(categories.some((category) => category.slug === '')).toBe(false);
  });

  it('match the number of templates the category page lists', () => {
    for (const source of [undefined, ['seo', 'SEO', 'Ops', 'QA', 'Travel', 'Business']]) {
      for (const category of buildDiscoveryCategories(templates, source)) {
        const listed = filterAndSortTemplates(templates, { categorySlug: category.slug, sortBy: 'popular' });
        expect(category.count, category.slug).toBe(listed.length);
      }
    }
  });
});

describe('uniqueCategoryNames', () => {
  it('keeps the first spelling of each slug, trimmed, and names with no slug once', () => {
    expect(uniqueCategoryNames(['SEO', ' seo ', 'Q&A', 'QA', '', '  ', '!!!', '!!!', 'Café', 'cafe'])).toEqual([
      'SEO',
      'Q&A',
      '!!!',
      'Café',
    ]);
  });
});

describe('category lists at the write boundary', () => {
  it('are deduplicated by slug when a backup is imported', async () => {
    const file = new File(
      [JSON.stringify([{ ...template('imported', ['SEO', 'seo', 'Seo', 'Travel']), sections: [] }])],
      'templates.json',
      { type: 'application/json' },
    );

    const result = await parseTemplatesFromJSON(file);

    expect(result.templates[0].categories).toEqual(['SEO', 'Travel']);
  });

  it('are deduplicated by slug when the editor saves', () => {
    const saved = normalizeTemplateEditorDetailsForSave({
      categories: ['Home Inspection', 'home inspection', 'business'],
      description: '',
      isPublic: false,
      seoDescription: '',
      seoTitle: '',
      seoUrl: '',
      tags: [],
      templateType: 'checklist',
      title: 'Inspection',
    });

    expect(saved.categories).toEqual(['Home Inspection', 'business']);
  });
});

describe('template card category pills', () => {
  it('show each category once, without duplicate keys', () => {
    navigation.reset('/templates');
    const html = renderToStaticMarkup(
      <TemplateCard template={template('pills', ['SEO', 'SEO', 'seo', 'Ops'])} />,
    );

    const pills = [...html.matchAll(/rounded-full bg-secondary[^>]*>([^<]*)</g)].map((match) => match[1]);
    expect(pills).toEqual(['SEO', 'Ops']);
  });
});
