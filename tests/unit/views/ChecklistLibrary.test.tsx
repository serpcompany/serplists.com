import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { metadata as libraryMetadata } from '@/app/(site)/templates/page';
import ChecklistLibrary from '@/views/ChecklistLibrary';
import Categories from '@/views/Categories';
import CategoryDetail from '@/views/CategoryDetail';
import { LIBRARY_FILTER_UPDATE_STATE } from '@/components/checklist-library/libraryFilters';
import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicCategoryPath,
  buildPublicTemplatesPath,
  hasCanonicalPublicTemplatePath,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';
import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { navigation, RoutedPages } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const mockUseTemplateLibrary = vi.fn();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

// A category page adds a robots tag to the server's metadata once it knows it has nothing to
// index (NoIndexMeta); React hoists it into <head>.
const renderCategoryPage = (location: string) => {
  navigation.reset(location, { routes: ['/categories/[categorySlug]'] });
  const markup = renderToStaticMarkup(<CategoryDetail />);
  return { markup, robots: markup.match(/<meta name="robots"[^>]*>/)?.[0] ?? '' };
};

const baseTemplate: ChecklistTemplate = {
  id: 'template-1',
  title: 'Template',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
};

describe('ChecklistLibrary route behavior', () => {
  it('renders the v0 /templates discovery page sections instead of the generic library shell', () => {
    const discoveryTemplate: ChecklistTemplate = {
      ...baseTemplate,
      id: 'website-launch',
      slug: 'website-launch-checklist',
      title: 'Website Launch Checklist',
      description:
        'A comprehensive checklist for launching a new website.',
      categories: ['Web Development', 'Launch'],
      ownerProfile: { full_name: 'Design Ops', username: 'designops' },
      sections: [
        {
          id: 'section-1',
          title: 'Pre-Launch',
          items: [{ id: 'item-1', title: 'Task 1' }],
        },
      ],
    };

    mockUseTemplateLibrary.mockReturnValue({
      templates: [discoveryTemplate],
      loading: false,
      allCategories: ['Launch', 'Web Development'],
    });

    navigation.reset('/templates/');
    const markup = renderToStaticMarkup(
      <ChecklistLibrary />,
    );

    expect(markup).toContain('Template Library');
    expect(markup).toContain(
      'Browse hundreds of ready-to-use checklists created by the community',
    );
    expect(markup).toContain('1 templates');
    expect(markup).toContain('Browse by Category');
    expect(markup).toContain('href="/profile/designops/website-launch-checklist/"');
    expect(markup).toContain('href="/categories/launch/"');
    expect(markup).not.toContain('href="/templates/?category=launch"');
    expect(markup).not.toContain('href="/templates?category=launch"');
    expect(markup).not.toContain('Template library');
    expect(markup).not.toContain('Browse all templates');
    // The route's own title and canonical URL, rendered on the server.
    expect(libraryMetadata.title).toEqual({ absolute: 'Template Library | SERP Lists' });
    expect(libraryMetadata.alternates?.canonical).toBe('https://serplists.com/templates/');
  });

  it('navigates to the owner/template path when the owner username is known', () => {
    const mockNavigate = vi.fn();
    const template: ChecklistTemplate = {
      ...baseTemplate,
      slug: 'ultimate-camping-checklist',
      ownerProfile: { username: 'alice' },
    };

    const path = buildCanonicalPublicTemplatePath(template);
    mockNavigate(path ?? buildPublicTemplatesPath());

    expect(mockNavigate).toHaveBeenCalledWith(
      '/profile/alice/ultimate-camping-checklist/',
    );
  });

  it('uses the official owner slug for repo-backed public templates', () => {
    const mockNavigate = vi.fn();
    const template: ChecklistTemplate = {
      ...baseTemplate,
      id: 'repo:starter-template',
      slug: 'starter-template',
      userId: REPO_TEMPLATE_USER_ID,
    };

    const path = buildCanonicalPublicTemplatePath(template);
    mockNavigate(path ?? buildPublicTemplatesPath());

    expect(mockNavigate).toHaveBeenCalledWith(
      `/profile/${REPO_TEMPLATE_OWNER_SLUG}/starter-template/`,
    );
  });

  it('gives a template whose owner has no username no public URL, so discovery leaves it out', () => {
    const template: ChecklistTemplate = {
      ...baseTemplate,
      slug: 'missing-owner',
      ownerProfile: { full_name: 'Email Signup' },
    };

    expect(buildCanonicalPublicTemplatePath(template)).toBeNull();
    expect(hasCanonicalPublicTemplatePath(template)).toBe(false);
  });

  it('builds category filters as category detail routes', () => {
    expect(buildPublicCategoryPath('technical seo')).toBe(
      '/categories/technical-seo/',
    );
  });

  it('renders the categories route with the v0 sections and CTA treatment', () => {
    mockUseTemplateLibrary.mockReturnValue({
      templates: [
        {
          ...baseTemplate,
          id: 'business-ops',
          title: 'Business Ops Checklist',
          categories: ['Business & Operations'],
        },
        {
          ...baseTemplate,
          id: 'launch-plan',
          title: 'Launch Plan',
          categories: ['Launch'],
        },
      ],
      loading: false,
      allCategories: ['Business & Operations', 'Launch'],
    });

    navigation.reset('/categories');
    const markup = renderToStaticMarkup(
      <Categories />,
    );

    expect(markup).toContain('Browse Categories');
    expect(markup).toContain('Popular Categories');
    expect(markup).toContain('All Categories');
    expect(markup).toContain('Business &amp; Operations');
    expect(markup).toContain('Can&#x27;t find what you&#x27;re looking for?');
    expect(markup).toContain('Create Template');
  });

  it('renders the business operations category route with the v0 breadcrumb, stats, and related categories', () => {
    mockUseTemplateLibrary.mockReturnValue({
      templates: [
        {
          ...baseTemplate,
          id: 'business-ops',
          title: 'Business Ops Checklist',
          categories: ['Business & Operations'],
        },
        {
          ...baseTemplate,
          id: 'launch-plan',
          title: 'Launch Plan',
          categories: ['Launch'],
        },
      ],
      loading: false,
      allCategories: ['Business & Operations', 'Launch'],
    });

    // The category's title and canonical URL come from its server metadata
    // (tests/unit/server/pageMeta/categoryPage.test.ts).
    const { markup } = renderCategoryPage('/categories/business-operations');

    expect(markup).toContain('All Categories');
    expect(markup).toContain('Business &amp; Operations');
    expect(markup).toContain('1 templates');
    expect(markup).toContain('Search templates...');
    expect(markup).toContain('Most Popular');
    expect(markup).toContain('Related Categories');
    expect(markup).not.toContain('noindex');
  });

  it('renders not-found UI for an unknown category slug instead of a fake empty category', () => {
    mockUseTemplateLibrary.mockReturnValue({
      templates: [
        {
          ...baseTemplate,
          id: 'business-ops',
          title: 'Business Ops Checklist',
          categories: ['Business & Operations'],
        },
      ],
      loading: false,
      allCategories: ['Business & Operations'],
    });

    const { markup, robots } = renderCategoryPage('/categories/not-a-real-category');

    expect(markup).toContain('That page does not exist');
    // The server's HTML never names the address (src/views/NotFound.tsx).
    expect(markup).toContain('This route could not be found.');
    expect(markup).not.toContain('0 templates');
    expect(robots).toMatch(/name="robots" content="noindex/);
  });
});

describe('Discovery pages while the catalog loads', () => {
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
  const renderCategory = (location: string) => renderCategoryPage(location).markup;
  const renderLibrary = (location: string) => {
    navigation.reset(location);
    return renderToStaticMarkup(
      <ChecklistLibrary />,
    );
  };

  it('shows a loading category page, not the 404 page, for a database-only category', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ loading: true }));

    const { markup, robots } = renderCategoryPage('/categories/moving');

    expect(markup).not.toContain('That page does not exist');
    expect(markup).toContain('aria-busy="true"');
    // The category is in the sitemap: a crawler that snapshots the loading page must not
    // see noindex.
    expect(robots).not.toContain('noindex');
  });

  it('renders the category once the catalog brings its templates', () => {
    mockUseTemplateLibrary.mockReturnValue(
      libraryState({ templates: [bundledTemplate, movingTemplate] }),
    );

    const markup = renderCategory('/categories/moving');

    expect(markup).not.toContain('That page does not exist');
    expect(markup).toContain('Moving Day');
    expect(markup).toContain('1 templates');
  });

  it('shows a retry state, not the 404 page, when the catalog failed to load', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ catalogError: true }));

    const { markup, robots } = renderCategoryPage('/categories/moving');

    expect(markup).not.toContain('That page does not exist');
    expect(robots).not.toContain('noindex');
    expect(markup).toContain('Could not load templates');
    expect(markup).toContain('Try again');
  });

  it('renders known categories at once and keeps the empty message back while loading', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ loading: true }));

    const bundled = renderCategory('/categories/outdoor');
    expect(bundled).not.toContain('That page does not exist');
    expect(bundled).toContain('<h1');
    expect(bundled).toContain('aria-busy="true"');

    const registry = renderCategory('/categories/business');
    expect(registry).toContain('Business &amp; Operations');
    expect(registry).not.toContain('No templates found matching your search.');
    expect(registry).toContain('aria-busy="true"');
  });

  // Only the browser has the entry's state, so these mount the page as the browser does; the
  // library is the page at /templates only.
  const mountLibrary = async (location: string, state: unknown = null) => {
    navigation.reset(location, { state });
    const restoreGlobals = installFakeDomGlobals(navigation.window);
    const container = createFakeContainer();
    const root = createRoot(container as unknown as HTMLElement);
    try {
      await act(async () => root.render(<RoutedPages pages={{ '/templates': <ChecklistLibrary /> }} />));
      return container.textContent;
    } finally {
      act(() => root.unmount());
      restoreGlobals();
    }
  };

  it('stays on the library when its own edit leaves only a category in the URL', async () => {
    mockUseTemplateLibrary.mockReturnValue(
      libraryState({ templates: [bundledTemplate, movingTemplate] }),
    );

    // Clearing the search on ?category=moving&search=box writes ?category=moving, marking
    // the entry as written here.
    const selfWritten = await mountLibrary('/templates/?category=moving', LIBRARY_FILTER_UPDATE_STATE);
    expect(selfWritten).toContain('Template Library');
    expect(selfWritten).toContain('Moving Day');
    expect(selfWritten).not.toContain('Camping Checklist');
    expect(navigation.url()).toBe('/templates/?category=moving');

    // A link from elsewhere still lands on the category page.
    const incoming = await mountLibrary('/templates/?category=moving');
    expect(incoming).not.toContain('Template Library');
    expect(navigation.url()).toBe('/categories/moving/');
  });

  it('shows the search from the URL in the search box and filters by it', () => {
    mockUseTemplateLibrary.mockReturnValue(
      libraryState({ templates: [bundledTemplate, movingTemplate] }),
    );

    const markup = renderLibrary('/templates?search=%20moving%20&sort=recent');

    expect(markup).toContain('value="moving"');
    expect(markup).toContain('Moving Day');
    expect(markup).not.toContain('Camping Checklist');
  });

  it('never tells a library search that nothing matched before the catalog has loaded', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ loading: true }));
    expect(renderLibrary('/templates?search=moving')).not.toContain('No templates found');

    mockUseTemplateLibrary.mockReturnValue(libraryState({ catalogError: true }));
    const failed = renderLibrary('/templates?search=moving');
    expect(failed).not.toContain('No templates found');
    expect(failed).toContain('Could not load templates');
    expect(failed).toContain('Try again');
  });
});
