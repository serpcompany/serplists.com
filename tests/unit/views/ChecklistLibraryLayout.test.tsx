import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChecklistLibrary from '@/views/ChecklistLibrary';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateLibrary = vi.fn();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

const template: ChecklistTemplate = {
  id: 'template-1',
  slug: 'technical-seo-audit-checklist',
  title: 'Technical SEO Audit Checklist',
  description: 'Audit crawlability, indexing, and internal link hygiene.',
  sections: [
    {
      id: 'section-1',
      title: 'Crawl setup',
      items: [
        {
          id: 'item-1',
          title: 'Confirm robots rules',
          description: '',
          contents: [],
        },
      ],
    },
  ],
  categories: ['Technical SEO'],
  tags: [],
  type: 'checklist',
  userId: 'user-1',
  isPublic: true,
  version: 1,
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
};

const renderChecklistLibrary = () =>
  renderToStaticMarkup(
    <HelmetProvider>
      <StaticRouter location="/templates">
        <Routes>
          <Route path="*" element={<ChecklistLibrary />} />
        </Routes>
      </StaticRouter>
    </HelmetProvider>,
  );

describe('ChecklistLibrary layout', () => {
  beforeEach(() => {
    mockUseTemplateLibrary.mockReturnValue({
      templates: [template],
      filteredTemplates: [template],
      loading: false,
      searchQuery: '',
      setSearchQuery: vi.fn(),
      selectedCategories: ['Technical SEO'],
      setSelectedCategories: vi.fn(),
      allCategories: ['Technical SEO', 'Content Ops'],
    });
  });

  it('starts the catalog with discovery sort controls instead of the old stacked filter shell', () => {
    const html = renderChecklistLibrary();

    expect(html).toContain('Popular');
    expect(html).toContain('Trending');
    expect(html).toContain('Recent');
    expect(html).not.toContain('Templates in view');
    expect(html).not.toContain('Actionable steps');
    expect(html).not.toContain('Available categories');
    expect(html).not.toContain('Showing');
  });

  it('uses the deployed public-library hero copy instead of the local migration copy', () => {
    const html = renderChecklistLibrary();

    expect(html).toContain('Discover Templates');
    expect(html).toContain(
      'Browse hundreds of ready-to-use checklists created by the community',
    );
    expect(html).not.toContain('Find the template pack that already solved it');
  });
});
