import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { repoTemplates } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';
import type { useTemplateLists } from '@/contexts/TemplatesContext';

type TemplateListsArgs = Parameters<typeof useTemplateLists>;

const mockUseTemplateLists = vi.fn<(...args: TemplateListsArgs) => Partial<ReturnType<typeof useTemplateLists>>>();

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: (...args: TemplateListsArgs) => mockUseTemplateLists(...args),
}));

type Library = ReturnType<typeof useTemplateLibrary>;

const renderFirstPassWithoutEffects = (): Library => {
  let captured: Library | undefined;
  const Probe = () => {
    captured = useTemplateLibrary();
    return null;
  };
  renderToStaticMarkup(<Probe />);
  if (!captured) throw new Error('useTemplateLibrary did not render');
  return captured;
};

const databaseTemplate: ChecklistTemplate = {
  id: 'db-moving',
  title: 'Moving Day',
  slug: 'moving-day',
  sections: [],
  categories: ['moving'],
  userId: 'user-1',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
  ownerProfile: { username: 'alice' },
};

describe('useTemplateLibrary', () => {
  beforeEach(() => {
    mockUseTemplateLists.mockReset();
  });

  it('reports loading while the catalog is pending even though bundled templates are present', () => {
    expect(repoTemplates.length).toBeGreaterThan(0);
    mockUseTemplateLists.mockReturnValue({
      templates: repoTemplates,
      templatesLoading: true,
      catalogPending: true,
      catalogError: false,
      refetchCatalog: vi.fn(),
    });

    const library = renderFirstPassWithoutEffects();

    expect(library.loading).toBe(true);
    expect(library.catalogError).toBe(false);
  });

  it('stops loading once the catalog query has data, and reports a failed catalog', () => {
    mockUseTemplateLists.mockReturnValue({
      templates: [...repoTemplates, databaseTemplate],
      templatesLoading: false,
      catalogPending: false,
      catalogError: false,
      refetchCatalog: vi.fn(),
    });
    expect(renderFirstPassWithoutEffects().loading).toBe(false);

    const refetchCatalog = vi.fn();
    mockUseTemplateLists.mockReturnValue({
      templates: repoTemplates,
      templatesLoading: false,
      catalogPending: false,
      catalogError: true,
      refetchCatalog,
    });
    const failed = renderFirstPassWithoutEffects();
    expect(failed.loading).toBe(false);
    expect(failed.catalogError).toBe(true);
    failed.retryCatalog();
    expect(refetchCatalog).toHaveBeenCalledTimes(1);
  });

  it('has every category on the first render, before any effect runs', () => {
    mockUseTemplateLists.mockReturnValue({
      templates: [...repoTemplates, databaseTemplate],
      templatesLoading: false,
      catalogPending: false,
      catalogError: false,
      refetchCatalog: vi.fn(),
    });

    const { allCategories } = renderFirstPassWithoutEffects();

    expect(allCategories).toEqual(expect.arrayContaining(['moving', 'wedding', 'outdoor', 'Tech']));
    expect(allCategories).toEqual([...allCategories].sort());
  });

  it('leaves out public templates that have no public URL because their owner has no username', () => {
    const orphan = (id: string, ownerProfile?: ChecklistTemplate['ownerProfile']): ChecklistTemplate => ({
      ...databaseTemplate,
      id,
      slug: id,
      title: `Orphan ${id}`,
      categories: ['orphaned'],
      ownerProfile,
    });
    mockUseTemplateLists.mockReturnValue({
      templates: [
        ...repoTemplates,
        databaseTemplate,
        orphan('no-username', { full_name: 'Email Signup' }),
        orphan('blank-username', { full_name: 'Blank', username: '   ' }),
        orphan('no-owner-profile'),
      ],
      templatesLoading: false,
      catalogPending: false,
      catalogError: false,
      refetchCatalog: vi.fn(),
    });

    const library = renderFirstPassWithoutEffects();
    const ids = library.templates.map((template) => template.id);

    expect(ids).toEqual([...repoTemplates.map((template) => template.id), databaseTemplate.id]);
    expect(library.filteredTemplates.map((template) => template.id)).toEqual(ids);
    expect(library.allCategories).not.toContain('orphaned');
  });
});

describe('useTemplateLibrary loading, which follows the catalog query, since bundled Templates make the list non-empty from the start', () => {
  const bundledTemplate: ChecklistTemplate = {
    id: 'repo:camping',
    title: 'Camping Checklist',
    sections: [],
    userId: 'repo-template-catalog',
    createdAt: '2026-03-24T00:00:00.000Z',
    updatedAt: '2026-03-24T00:00:00.000Z',
    isPublic: true,
    categories: ['outdoor'],
  };

  it('reports the catalog as loading while bundled Templates are already present', () => {
    mockUseTemplateLists.mockReturnValue({
      templates: [bundledTemplate],
      templatesLoading: true,
      catalogPending: true,
      catalogError: false,
      refetchCatalog: vi.fn(),
    });

    const state = renderFirstPassWithoutEffects();

    expect(state.templates).toHaveLength(1);
    expect(state.loading).toBe(true);
  });

  it('clears loading once the catalog query settles', () => {
    mockUseTemplateLists.mockReturnValue({
      templates: [bundledTemplate],
      templatesLoading: false,
      catalogPending: false,
      catalogError: false,
      refetchCatalog: vi.fn(),
    });

    expect(renderFirstPassWithoutEffects().loading).toBe(false);
  });
});
