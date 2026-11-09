import { navigation } from '../../support/mockedNextNavigation';
import { libraryState, mockUseTemplateLibrary, movingTemplate } from '../../support/mockedTemplateLibrary';
import React from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistTemplate } from '@/types/checklist';
import CategoryDetail from '@/views/CategoryDetail';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';
import { chooseTheOption } from '../../support/selectOptions';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

theInMemoryBrowserAsTheWindow();
afterEach(() => cleanup());

const inEngineering = (id: string, title: string, updatedAt: string): ChecklistTemplate => ({
  ...movingTemplate,
  id,
  slug: id,
  title,
  categories: ['engineering'],
  updatedAt,
});

const zeta = inEngineering('zeta-review', 'Zeta Review', '2026-03-26T00:00:00.000Z');
const alpha = inEngineering('alpha-deploy', 'Alpha Deploy', '2026-03-25T00:00:00.000Z');

beforeEach(() => {
  mockUseTemplateLibrary.mockReset().mockReturnValue(libraryState({ templates: [zeta, alpha], allCategories: ['engineering'] }));
});

const openTheCategory = async (slug = 'engineering') => {
  navigation.reset(`/categories/${slug}/`, { routes: ['/categories/[categorySlug]'] });
  await renderSettled(<CategoryDetail />);
};

const shownTitles = () => screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
const templateCards = () => [...document.querySelectorAll('[data-slot="media-card"]')];

describe('CategoryDetail browsing', () => {
  it('narrows the Templates to the search, and says when none match', async () => {
    await openTheCategory();

    await typeInto(inputNamed('Search'), 'alpha');
    expect(shownTitles()).toContain('Alpha Deploy');
    expect(shownTitles()).not.toContain('Zeta Review');

    await typeInto(inputNamed('Search'), 'no such template');
    expect(document.body.textContent).toContain('No templates found matching your search.');
  });

  it('sorts the Templates by name when the user picks Name A-Z', async () => {
    await openTheCategory();
    expect(shownTitles().indexOf('Zeta Review')).toBeLessThan(shownTitles().indexOf('Alpha Deploy'));

    await chooseTheOption('Sort by', 'Name A-Z');

    expect(shownTitles().indexOf('Alpha Deploy')).toBeLessThan(shownTitles().indexOf('Zeta Review'));
  });

  it('lays the Templates out in rows in list view', async () => {
    await openTheCategory();
    expect(templateCards().map((card) => card.getAttribute('data-orientation'))).toEqual(['vertical', 'vertical']);

    await pressTheButton('Show templates in list view');

    expect(templateCards().map((card) => card.getAttribute('data-orientation'))).toEqual(['horizontal', 'horizontal']);
  });

  it('keeps a known category open with a retry, and no empty state, when the catalog failed', async () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ templates: [], allCategories: [], catalogError: true }));
    await openTheCategory();

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Engineering & Development');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(document.body.textContent).not.toContain('No public templates in this category yet.');
  });

  it('offers a retry, not the missing page, for a category it cannot know while the catalog failed', async () => {
    mockUseTemplateLibrary.mockReturnValue(libraryState({ templates: [], allCategories: [], catalogError: true }));
    await openTheCategory('woodworking');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Could not load templates');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
    expect(document.body.textContent).not.toContain('That page does not exist');
  });

  it('moves an old ASCII-only address to the category it names now', async () => {
    mockUseTemplateLibrary.mockReturnValue(
      libraryState({ templates: [{ ...zeta, categories: ['Café Culture'] }], allCategories: ['Café Culture'] }),
    );
    await openTheCategory('caf-culture');

    expect(navigation.url()).toBe('/categories/cafe-culture/');
  });
});
