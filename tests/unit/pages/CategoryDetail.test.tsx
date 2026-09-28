import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import CategoryDetail from '@/pages/CategoryDetail';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateLibrary = vi.fn();
const mockSeoHead = vi.fn();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('@/components/shared/SEOHead', () => ({
  SEOHead: (props: Record<string, unknown>) => {
    mockSeoHead(props);
    return null;
  },
}));

const engineeringTemplate: ChecklistTemplate = {
  id: 'code-review',
  title: 'Code Review Checklist',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
  categories: ['Engineering'],
};

const campingTemplate: ChecklistTemplate = {
  ...engineeringTemplate,
  id: 'camping',
  title: 'Camping Checklist',
  categories: ['outdoor'],
};

function renderCategory(slug: string) {
  return renderToStaticMarkup(
    <StaticRouter location={`/categories/${slug}`}>
      <Routes>
        <Route path="/categories/:categorySlug" element={<CategoryDetail />} />
      </Routes>
    </StaticRouter>,
  );
}

const robots = () => mockSeoHead.mock.calls.at(-1)?.[0].robots;

describe('CategoryDetail empty categories', () => {
  beforeEach(() => {
    mockSeoHead.mockClear();
  });

  it('keeps a loaded category with no public Templates out of search results', () => {
    mockUseTemplateLibrary.mockReturnValue({ templates: [campingTemplate], loading: false, catalogLoading: false, allCategories: ['outdoor'] });
    const markup = renderCategory('engineering');

    expect(markup).toContain('Engineering &amp; Development');
    expect(markup).toContain('No public templates in this category yet.');
    expect(markup).not.toContain('matching your search');
    expect(robots()).toBe('noindex, follow');
  });

  it('does not mark a category empty or noindex while the catalog is loading', () => {
    // Bundled Templates are always present, so the hook's `loading` is already false;
    // only `catalogLoading` says the catalog API request is still in flight.
    mockUseTemplateLibrary.mockReturnValue({
      templates: [campingTemplate],
      loading: false,
      catalogLoading: true,
      allCategories: ['outdoor'],
    });
    const markup = renderCategory('engineering');

    expect(markup).toContain('Engineering &amp; Development');
    expect(markup).toContain('Loading templates…');
    expect(markup).not.toContain('No public templates in this category yet.');
    expect(markup).not.toContain('matching your search');
    expect(markup).not.toContain('0 templates');
    expect(robots()).not.toBe('noindex, follow');
  });

  it('waits for the catalog before treating an unregistered category as missing', () => {
    mockUseTemplateLibrary.mockReturnValue({
      templates: [campingTemplate],
      loading: false,
      catalogLoading: true,
      allCategories: ['outdoor'],
    });
    const loadingMarkup = renderCategory('seo');

    expect(loadingMarkup).toContain('Loading templates…');
    expect(loadingMarkup).not.toContain('That page does not exist');

    mockUseTemplateLibrary.mockReturnValue({
      templates: [campingTemplate],
      loading: false,
      catalogLoading: false,
      allCategories: ['outdoor'],
    });
    expect(renderCategory('seo')).toContain('That page does not exist');
  });

  it('indexes a category that has public Templates', () => {
    mockUseTemplateLibrary.mockReturnValue({ templates: [engineeringTemplate], loading: false, catalogLoading: false, allCategories: ['Engineering'] });
    const markup = renderCategory('engineering');

    expect(markup).toContain('Code Review Checklist');
    expect(markup).toContain('1 templates');
    expect(robots()).not.toBe('noindex, follow');
  });
});
