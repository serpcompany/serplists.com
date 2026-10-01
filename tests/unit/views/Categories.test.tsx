import { navigation } from '../../support/mockedNextNavigation';
import {
  bundledTemplate,
  libraryState,
  mockUseTemplateLibrary,
  movingTemplate,
} from '../../support/mockedTemplateLibrary';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { firstOf } from '../../support/elements';

import Categories from '@/views/Categories';
import { click, createFakeContainer, FakeElement, findAll, installFakeDomGlobals, type FakeNode } from '../../fixtures/fakeDom';

const catalogErrorProps = vi.fn();

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

const renderCategories = () => {
  navigation.reset('/categories/');
  return renderToStaticMarkup(
    <Categories />,
  );
};

beforeEach(() => {
  mockUseTemplateLibrary.mockReset();
  catalogErrorProps.mockReset();
});

describe('Categories page catalog states, which never present the bundled starter templates as the whole catalog', () => {
  it('shows skeletons, not the bundled-only categories and counts, while the catalog loads', () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ loading: true }));

    const markup = renderCategories();

    expect(markup).toContain('Browse Categories');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain('href="/categories/outdoor/"');
    expect(markup).not.toMatch(/\d+ templates/);
    expect(markup).not.toContain('Could not load templates');
  });

  it('shows one retry state instead of bundled-only categories when the catalog failed', () => {
    const retryCatalog = vi.fn();
    mockUseTemplateLibrary.mockReturnValue(libraryState({ catalogError: true, retryCatalog }));

    const markup = renderCategories();

    expect(markup).toContain('role="alert"');
    expect(markup.match(/Could not load templates/g)).toHaveLength(1);
    expect(markup.match(/Try again/g)).toHaveLength(1);
    expect(markup).not.toContain('href="/categories/outdoor/"');
    expect(markup).not.toMatch(/\d+ templates/);
    expect(markup).not.toContain('aria-busy="true"');

    expect(catalogErrorProps).toHaveBeenCalledTimes(1);
    const [{ onRetry }] = catalogErrorProps.mock.calls[0] as [{ onRetry: () => void }];
    onRetry();
    expect(retryCatalog).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['loads', { loading: true }],
    ['failed', { catalogError: true }],
  ])('keeps the Create Template call to action, which does not depend on the catalog, while the catalog %s', (_state, catalogState) => {
    mockUseTemplateLibrary.mockReturnValue(libraryState(catalogState));

    expect(renderCategories()).toContain('Create Template');
  });

  it('lists every category with its count once the catalog has loaded', () => {
    mockUseTemplateLibrary.mockReturnValue(
      libraryState({ templates: [bundledTemplate, movingTemplate] }),
    );

    const markup = renderCategories();

    expect(markup).toContain('Popular Categories');
    expect(markup).toContain('All Categories');
    expect(markup).toContain('href="/categories/outdoor/"');
    expect(markup).toContain('href="/categories/moving/"');
    expect(markup).toMatch(/\b1 template\b/);
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain('Could not load templates');
  });
});

const fieldNamedByItsLabel = (container: FakeNode, labelText: string) => {
  const label = firstOf(findAll(
    container,
    (node) => node instanceof FakeElement && node.nodeName === 'LABEL' && node.textContent === labelText,
  ) as FakeElement[]);
  return firstOf(findAll(
    container,
    (node) => node instanceof FakeElement && node.nodeName === 'INPUT' && node.getAttribute('id') === label.getAttribute('for'),
  ) as FakeElement[]);
};

const propsReactKeepsOnAField = z.object({ onChange: z.function().args(z.unknown()) }).passthrough();

const typeThroughTheFieldsOwnOnChange = async (field: FakeElement, value: string) => {
  const [, props] = Object.entries(field).find(([key]) => key.startsWith('__reactProps$')) ?? [];
  const { onChange } = propsReactKeepsOnAField.parse(props);
  await act(async () => onChange({ target: { value }, currentTarget: { value } }));
};

describe('Categories page search', () => {
  let root: Root | null = null;
  let restoreGlobals: () => void = () => {};
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    restoreGlobals();
  });

  const mount = async () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ templates: [bundledTemplate, movingTemplate] }));
    navigation.reset('/categories/');
    restoreGlobals = installFakeDomGlobals(navigation.window);
    const container = createFakeContainer();
    root = createRoot(container);
    await act(async () => root?.render(<Categories />));
    const search = fieldNamedByItsLabel(container, 'Search categories');
    const type = (value: string) => typeThroughTheFieldsOwnOnChange(search, value);
    const allCategoriesSectionLinks = () => {
      const allCategories = firstOf(findAll(
        container,
        (node) =>
          node.nodeName === 'SECTION' &&
          findAll(node, (child) => child.nodeName === 'H2' && child.textContent === 'All Categories').length > 0,
      ));
      return findAll(allCategories, (node) => node instanceof FakeElement && node.nodeName === 'A').map((node) =>
        (node as FakeElement).getAttribute('href'),
      );
    };
    return { container, allCategoriesSectionLinks, type };
  };

  it('says no category matches and offers Clear search, which lists every category again', async () => {
    const page = await mount();
    expect(page.allCategoriesSectionLinks()).toContain('/categories/moving/');

    await page.type('  zzz no such category ');
    expect(page.allCategoriesSectionLinks()).toEqual([]);
    expect(page.container.textContent).toContain('No categories match "zzz no such category"');
    const [heading] = findAll(page.container, (node) => node.nodeName === 'H3' && node.textContent.startsWith('No categories match'));
    expect(heading).toBeDefined();
    const clear = firstOf(findAll(page.container, (node) => node.nodeName === 'BUTTON' && node.textContent === 'Clear search'));

    act(() => click(page.container, clear));

    expect(page.container.textContent).not.toContain('No categories match');
    expect(page.allCategoriesSectionLinks()).toEqual(['/categories/moving/', '/categories/outdoor/']);
  });

  it('shows no empty state while the search matches a category', async () => {
    const page = await mount();

    await page.type('mov');

    expect(page.container.textContent).not.toContain('No categories match');
    expect(page.allCategoriesSectionLinks()).toEqual(['/categories/moving/']);
  });
});
