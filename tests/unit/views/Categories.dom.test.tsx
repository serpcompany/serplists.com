import { navigation } from '../../support/mockedNextNavigation';
import { shownConsole } from '../../support/mockedConsoleContext';
import {
  bundledTemplate,
  libraryState,
  mockUseTemplateLibrary,
  movingTemplate,
} from '../../support/mockedTemplateLibrary';
import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../support/elements';
import { inputNamed, renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';

import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import Categories from '@/views/Categories';
import type { CatalogLoadError } from '@/components/checklist-library/CatalogLoadError';

const catalogErrorProps = vi.fn<(props: React.ComponentProps<typeof CatalogLoadError>) => void>();

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
    const [{ onRetry }] = firstOf(catalogErrorProps.mock.calls);
    assert.exists(onRetry, 'the Try again handler');
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

  it("opens Create Template in the context the tab is in", () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ templates: [bundledTemplate] }));
    expect(renderCategories()).toContain('href="/dashboard/templates/new/"');

    shownConsole.context = organizationConsole('team-1');
    try {
      expect(renderCategories()).toContain('href="/dashboard/organization/team-1/templates/new/"');
    } finally {
      shownConsole.context = PERSONAL_CONSOLE;
    }
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

describe('Categories page search', () => {
  theInMemoryBrowserAsTheWindow();

  const mount = async () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ templates: [bundledTemplate, movingTemplate] }));
    navigation.reset('/categories/');
    const { container } = await renderSettled(<Categories />);
    const search = inputNamed('Search categories');
    const type = (value: string) => typeInto(search, value);
    const allCategoriesSectionLinks = () =>
      within(screen.getByRole('region', { name: 'All Categories' }))
        .queryAllByRole('link')
        .map((link) => link.getAttribute('href'));
    return { container, allCategoriesSectionLinks, type };
  };

  it('says no category matches and offers Clear search, which lists every category again', async () => {
    const page = await mount();
    expect(page.allCategoriesSectionLinks()).toContain('/categories/moving/');

    await page.type('  zzz no such category ');
    expect(page.allCategoriesSectionLinks()).toEqual([]);
    expect(page.container.textContent).toContain('No categories match "zzz no such category"');
    expect(screen.getByRole('heading', { name: /^No categories match/ })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

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
