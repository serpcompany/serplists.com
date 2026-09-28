import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateLists = vi.fn();

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: (...args: unknown[]) => mockUseTemplateLists(...args),
}));

const bundledTemplate: ChecklistTemplate = {
  id: 'camping',
  title: 'Camping Checklist',
  sections: [],
  userId: 'repo',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
  categories: ['outdoor'],
};

function readLibraryState() {
  let state: ReturnType<typeof useTemplateLibrary> | undefined;
  const Probe = () => {
    state = useTemplateLibrary();
    return null;
  };
  renderToStaticMarkup(<Probe />);
  if (!state) throw new Error('useTemplateLibrary did not render');
  return state;
}

describe('useTemplateLibrary loading flags', () => {
  it('reports the catalog as loading while bundled Templates are already present', () => {
    mockUseTemplateLists.mockReturnValue({ templates: [bundledTemplate], templatesLoading: true });

    const state = readLibraryState();

    expect(state.templates).toHaveLength(1);
    expect(state.loading).toBe(false);
    expect(state.catalogLoading).toBe(true);
  });

  it('clears catalogLoading once the catalog query settles', () => {
    mockUseTemplateLists.mockReturnValue({ templates: [bundledTemplate], templatesLoading: false });

    expect(readLibraryState().catalogLoading).toBe(false);
  });
});
