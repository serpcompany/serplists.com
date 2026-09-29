import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Categories from '@/views/Categories';
import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// /categories counts templates from useTemplateLibrary, whose list always holds the bundled
// starter templates. Until the public catalog has loaded, and for as long as it failed, those
// are all it has, so the page must not present bundled-only categories and counts as the
// catalog: it shows skeletons while loading and a retry state after a failure.

const mockUseTemplateLibrary = vi.fn();
const catalogErrorProps = vi.fn();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

vi.mock('@/components/shared/SEOHead', () => ({
  SEOHead: (props: Record<string, unknown>) => <div data-seo-head={String(props.url)} />,
}));

vi.mock('@/components/checklist-library/CatalogLoadError', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/components/checklist-library/CatalogLoadError')>();
  return {
    CatalogLoadError: (props: Parameters<typeof actual.CatalogLoadError>[0]) => {
      catalogErrorProps(props);
      return <actual.CatalogLoadError {...props} />;
    },
  };
});

const baseTemplate: ChecklistTemplate = {
  id: 'template-1',
  title: 'Template',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
};
const bundledTemplate: ChecklistTemplate = {
  ...baseTemplate,
  id: 'repo:camping',
  slug: 'camping',
  title: 'Camping Checklist',
  categories: ['outdoor'],
  userId: REPO_TEMPLATE_USER_ID,
};
const movingTemplate: ChecklistTemplate = {
  ...baseTemplate,
  id: 'db-moving',
  slug: 'moving-day',
  title: 'Moving Day',
  categories: ['moving'],
  ownerProfile: { username: 'alice' },
};

const libraryState = (overrides: Record<string, unknown>) => ({
  templates: [bundledTemplate],
  loading: false,
  catalogError: false,
  retryCatalog: vi.fn(),
  allCategories: ['moving', 'outdoor'],
  ...overrides,
});

const renderCategories = () => {
  navigation.reset('/categories');
  return renderToStaticMarkup(
    <Categories />,
  );
};

beforeEach(() => {
  mockUseTemplateLibrary.mockReset();
  catalogErrorProps.mockReset();
});

describe('Categories page catalog states', () => {
  it('shows skeletons, not the bundled-only categories and counts, while the catalog loads', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ loading: true }));

    const markup = renderCategories();

    expect(markup).toContain('Browse Categories');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('href="/categories/outdoor"');
    expect(markup).not.toMatch(/\d+ templates/);
    expect(markup).not.toContain('Could not load templates');
    // The call to action does not depend on the catalog.
    expect(markup).toContain('Create Template');
  });

  it('shows one retry state instead of bundled-only categories when the catalog failed', () => {
    const retryCatalog = vi.fn();
    mockUseTemplateLibrary.mockReturnValue(libraryState({ catalogError: true, retryCatalog }));

    const markup = renderCategories();

    expect(markup).toContain('role="alert"');
    expect(markup.match(/Could not load templates/g)).toHaveLength(1);
    expect(markup.match(/Try again/g)).toHaveLength(1);
    expect(markup).not.toContain('href="/categories/outdoor"');
    expect(markup).not.toMatch(/\d+ templates/);
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).toContain('Create Template');

    expect(catalogErrorProps).toHaveBeenCalledTimes(1);
    const [{ onRetry }] = catalogErrorProps.mock.calls[0] as [{ onRetry: () => void }];
    onRetry();
    expect(retryCatalog).toHaveBeenCalledTimes(1);
  });

  it('lists every category with its count once the catalog has loaded', () => {
    mockUseTemplateLibrary.mockReturnValue(
      libraryState({ templates: [bundledTemplate, movingTemplate] }),
    );

    const markup = renderCategories();

    expect(markup).toContain('Popular Categories');
    expect(markup).toContain('All Categories');
    expect(markup).toContain('href="/categories/outdoor"');
    expect(markup).toContain('href="/categories/moving"');
    expect(markup).toContain('1 templates');
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain('Could not load templates');
  });
});
