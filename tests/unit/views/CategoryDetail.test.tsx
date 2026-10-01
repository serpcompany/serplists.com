import { navigation } from '../../support/mockedNextNavigation';
import { FileText } from 'lucide-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveCategoryPresentation } from '@/components/checklist-library/categoryPresentation';
import { findCategoryByLegacySlug } from '@/components/checklist-library/discovery-utils';
import { PUBLIC_CATEGORY_REGISTRY } from '@/data/publicCategories';
import { buildPublicCategoryPath } from '@/lib/routes';
import CategoryDetail from '@/views/CategoryDetail';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseTemplateLibrary = vi.fn();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

const renderCategoryPage = (location: string) => {
  navigation.reset(location, { routes: ['/categories/[categorySlug]'] });
  return renderToStaticMarkup(<CategoryDetail />);
};

const robotsTagThePageAdds = (markup: string) => markup.match(/<meta name="robots" content="([^"]*)"/)?.[1];

const template = (id: string, title: string, categories: string[]): ChecklistTemplate => ({
  categories,
  createdAt: '2026-03-24T00:00:00.000Z',
  id,
  isPublic: true,
  ownerProfile: { username: 'alice' },
  sections: [],
  slug: id,
  title,
  updatedAt: '2026-03-24T00:00:00.000Z',
  userId: 'user-1',
});

const libraryState = (templates: ChecklistTemplate[]) => ({
  allCategories: [...new Set(templates.flatMap((item) => item.categories ?? []))],
  catalogError: false,
  loading: false,
  retryCatalog: vi.fn(),
  templates,
});

const OBJECT_PROTOTYPE_KEYS = [
  'constructor',
  '__proto__',
  'toString',
  'valueOf',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  '__defineGetter__',
  '__lookupGetter__',
];

describe('CategoryDetail with slugs that are Object.prototype keys', () => {
  beforeEach(() => {
    mockUseTemplateLibrary.mockReset();
  });

  it.each(OBJECT_PROTOTYPE_KEYS)('renders the 404 page for /categories/%s, never a built-in category with an undefined icon', (slug) => {
    mockUseTemplateLibrary.mockReturnValue(libraryState([template('camping', 'Camping', ['Outdoor'])]));

    const markup = renderCategoryPage(`/categories/${slug}`);

    expect(markup).toContain('That page does not exist');
    expect(robotsTagThePageAdds(markup)).toBe('noindex, follow');
  });

  it('renders a real category named Constructor with a generic icon', () => {
    mockUseTemplateLibrary.mockReturnValue(
      libraryState([template('site-setup', 'Site Setup Checklist', ['Constructor'])]),
    );

    const markup = renderCategoryPage('/categories/constructor');

    expect(markup).not.toContain('That page does not exist');
    expect(markup).toMatch(/<h1[^>]*>Constructor<\/h1>/);
    expect(markup).toContain('Templates filed under Constructor.');
    expect(markup).toContain('Site Setup Checklist');
    expect(markup).toMatch(/\b1 template\b/);
  });

  it('keeps the built-in presentation for registry categories', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState([]));

    const markup = renderCategoryPage('/categories/business');

    expect(markup).toContain('Business &amp; Operations');
    expect(markup).toContain('lucide-briefcase');
  });
});

describe('resolveCategoryPresentation', () => {
  it.each(OBJECT_PROTOTYPE_KEYS)('treats %s as unknown unless a template uses it', (slug) => {
    expect(resolveCategoryPresentation(slug, undefined)).toBeNull();

    const presentation = resolveCategoryPresentation(slug, { name: slug });
    expect(presentation?.icon).toBe(FileText);
    expect(presentation?.name).toBe(slug);
  });

  it('gives every registry category its name, description and a defined icon', () => {
    PUBLIC_CATEGORY_REGISTRY.forEach((entry) => {
      const presentation = resolveCategoryPresentation(entry.slug, undefined);
      expect(presentation).toMatchObject({ description: entry.description, name: entry.name });
      expect(presentation?.icon).toBeDefined();
    });
  });
});

describe('CategoryDetail for categories in other scripts', () => {
  beforeEach(() => {
    mockUseTemplateLibrary.mockReset();
  });

  it.each(['日本語', 'Русский', 'Мой дом', '한국어 가이드', 'Café Culture'])(
    'opens the page that the %s chip links to',
    (name) => {
      mockUseTemplateLibrary.mockReturnValue(
        libraryState([template('guide', 'Guide Checklist', [name]), template('other', 'Other', ['Travel'])]),
      );

      const path = buildPublicCategoryPath(name);
      expect(path).not.toBeNull();
      const markup = renderCategoryPage(path!);

      expect(markup).not.toContain('That page does not exist');
      expect(markup).toContain('Guide Checklist');
      expect(markup).not.toContain('>Other<');
      expect(markup).toMatch(/\b1 template\b/);
    },
  );

  it('opens the category from a decomposed (NFD) or upper-case URL', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState([template('guide', 'Guide Checklist', ['Café Culture'])]));

    expect(renderCategoryPage(`/categories/${encodeURIComponent('CAFÉ-culture')}`)).toContain('Guide Checklist');
  });

  it('sends an old ASCII-only slug to the category instead of the 404 page', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState([template('guide', 'Guide Checklist', ['Café Culture'])]));

    const markupBeforeTheEffectMovesToTheCurrentSlug = renderCategoryPage('/categories/caf-culture');

    expect(markupBeforeTheEffectMovesToTheCurrentSlug).not.toContain('That page does not exist');
    expect(findCategoryByLegacySlug([{ count: 1, name: 'Café Culture', slug: 'cafe-culture' }], 'caf-culture')?.slug).toBe(
      'cafe-culture',
    );
  });
});

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

const renderCategory = (slug: string) => renderCategoryPage(`/categories/${slug}`);

describe('CategoryDetail empty categories', () => {
  it('keeps a loaded category with no public Templates out of search results', () => {
    mockUseTemplateLibrary.mockReturnValue({ templates: [campingTemplate], loading: false, allCategories: ['outdoor'] });
    const markup = renderCategory('engineering');

    expect(markup).toContain('Engineering &amp; Development');
    expect(markup).toContain('No public templates in this category yet.');
    expect(markup).not.toContain('matching your search');
    expect(robotsTagThePageAdds(markup)).toBe('noindex, follow');
  });

  it('does not mark a category empty or noindex while the catalog is loading, though the bundled Templates are listed', () => {
    mockUseTemplateLibrary.mockReturnValue({
      templates: [campingTemplate],
      loading: true,
      allCategories: ['outdoor'],
    });
    const markup = renderCategory('engineering');

    expect(markup).toContain('Engineering &amp; Development');
    expect(markup).toContain('Loading templates…');
    expect(markup).not.toContain('No public templates in this category yet.');
    expect(markup).not.toContain('matching your search');
    expect(markup).not.toContain('0 templates');
    expect(robotsTagThePageAdds(markup)).toBeUndefined();
  });

  it('waits for the catalog before treating an unregistered category as missing', () => {
    mockUseTemplateLibrary.mockReturnValue({
      templates: [campingTemplate],
      loading: true,
      allCategories: ['outdoor'],
    });
    const loadingMarkup = renderCategory('seo');

    expect(loadingMarkup).toContain('Loading templates…');
    expect(loadingMarkup).not.toContain('That page does not exist');

    mockUseTemplateLibrary.mockReturnValue({
      templates: [campingTemplate],
      loading: false,
      allCategories: ['outdoor'],
    });
    expect(renderCategory('seo')).toContain('That page does not exist');
  });

  it('indexes a category that has public Templates', () => {
    mockUseTemplateLibrary.mockReturnValue({ templates: [engineeringTemplate], loading: false, allCategories: ['Engineering'] });
    const markup = renderCategory('engineering');

    expect(markup).toContain('Code Review Checklist');
    expect(markup).toMatch(/\b1 template\b/);
    expect(robotsTagThePageAdds(markup)).toBeUndefined();
  });
});
