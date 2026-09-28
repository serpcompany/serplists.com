import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { repoTemplates } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateLists = vi.fn();

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: (...args: unknown[]) => mockUseTemplateLists(...args),
}));

type Library = ReturnType<typeof useTemplateLibrary>;

// Server rendering runs no effects, so this captures what the very first render returns.
const renderFirstPass = (): Library => {
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

    const library = renderFirstPass();

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
    expect(renderFirstPass().loading).toBe(false);

    const refetchCatalog = vi.fn();
    mockUseTemplateLists.mockReturnValue({
      templates: repoTemplates,
      templatesLoading: false,
      catalogPending: false,
      catalogError: true,
      refetchCatalog,
    });
    const failed = renderFirstPass();
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

    const { allCategories } = renderFirstPass();

    expect(allCategories).toEqual(expect.arrayContaining(['moving', 'wedding', 'outdoor', 'Tech']));
    expect(allCategories).toEqual([...allCategories].sort());
  });
});
