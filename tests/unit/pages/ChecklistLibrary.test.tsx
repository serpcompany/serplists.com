import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import ChecklistLibrary from '@/pages/ChecklistLibrary';
import Categories from '@/pages/Categories';
import CategoryDetail from '@/pages/CategoryDetail';
import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicCategoryPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateLibrary = vi.fn();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

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

    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/templates']}>
        <ChecklistLibrary />
      </MemoryRouter>,
    );

    expect(markup).toContain('Discover Templates');
    expect(markup).toContain(
      'Browse hundreds of ready-to-use checklists created by the community',
    );
    expect(markup).toContain('1 templates');
    expect(markup).toContain('Browse by Category');
    expect(markup).toContain('href="/profile/designops/website-launch-checklist"');
    expect(markup).not.toContain('Template library');
    expect(markup).not.toContain('Browse all templates');
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
      '/profile/alice/ultimate-camping-checklist',
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
      `/profile/${REPO_TEMPLATE_OWNER_SLUG}/starter-template`,
    );
  });

  it('falls back to the public library when a template cannot produce a canonical owner URL', () => {
    const mockNavigate = vi.fn();
    const template: ChecklistTemplate = {
      ...baseTemplate,
      slug: 'missing-owner',
    };

    const path = buildCanonicalPublicTemplatePath(template);
    mockNavigate(path ?? buildPublicTemplatesPath());

    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('builds category filters as category detail routes', () => {
    expect(buildPublicCategoryPath('technical seo')).toBe(
      '/categories/technical-seo',
    );
  });

  it('renders the categories route with the v0 sections and CTA treatment', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/categories']}>
        <Categories />
      </MemoryRouter>,
    );

    expect(markup).toContain('Browse Categories');
    expect(markup).toContain('Popular Categories');
    expect(markup).toContain('All Categories');
    expect(markup).toContain('Business &amp; Operations');
    expect(markup).toContain('Can&#x27;t find what you&#x27;re looking for?');
    expect(markup).toContain('Create Template');
  });

  it('renders the business category route with the v0 breadcrumb, stats, and related categories', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/categories/business']}>
        <Routes>
          <Route path="/categories/:categorySlug" element={<CategoryDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(markup).toContain('All Categories');
    expect(markup).toContain('Business &amp; Operations');
    expect(markup).toContain('6 templates');
    expect(markup).toContain('Search templates...');
    expect(markup).toContain('Most Popular');
    expect(markup).toContain('Related Categories');
  });
});
