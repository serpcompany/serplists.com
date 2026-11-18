import { navigation, RoutedPages } from '../../support/mockedNextNavigation';
import '../../support/mockedConsoleContext';
import { bundledTemplate, libraryState, mockUseTemplateLibrary, movingTemplate } from '../../support/mockedTemplateLibrary';
import React, { act } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIBRARY_FILTER_UPDATE_STATE } from '@/components/checklist-library/libraryFilters';
import ChecklistLibrary from '@/views/ChecklistLibrary';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();
afterEach(() => cleanup());

beforeEach(() => {
  mockUseTemplateLibrary.mockReset().mockReturnValue(libraryState({ templates: [bundledTemplate, movingTemplate] }));
});

const openTheLibraryAt = async (location: string) => {
  navigation.reset(location, { state: LIBRARY_FILTER_UPDATE_STATE });
  await renderSettled(<RoutedPages pages={{ '/templates': <ChecklistLibrary /> }} />);
};

const shownTemplates = () => screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
const searchBox = () => inputNamed('Search templates');

describe('Template Library filters, which live in the address so a reload or a shared link keeps them', () => {
  it('filters by the search as it is typed, keeping the address hash', async () => {
    await openTheLibraryAt('/templates/#top');

    await typeInto(searchBox(), 'moving');

    expect(navigation.url()).toBe('/templates/?search=moving#top');
    expect(navigation.window.history.state).toMatchObject(LIBRARY_FILTER_UPDATE_STATE);
    expect(shownTemplates()).toContain('Moving Day');
    expect(shownTemplates()).not.toContain('Camping Checklist');
  });

  it('puts the chosen sort in the address and leaves the default out of it', async () => {
    await openTheLibraryAt('/templates/');

    await pressTheButton('Recent');
    expect(navigation.url()).toBe('/templates/?sort=recent');
    expect(screen.getByRole('button', { name: 'Recent' }).getAttribute('aria-pressed')).toBe('true');

    await pressTheButton('Popular');
    expect(navigation.url()).toBe('/templates/');
  });

  it('shows every category again on All', async () => {
    await openTheLibraryAt('/templates/?category=moving&search=day');
    expect(document.body.textContent).toContain('1 template in moving');

    await pressTheButton('All');

    expect(navigation.url()).toBe('/templates/?search=day');
  });

  it('offers Reset filters when nothing matches, which clears the search, category and sort', async () => {
    await openTheLibraryAt('/templates/?category=moving&search=zzz&sort=trending');
    expect(screen.getByRole('heading', { name: 'No templates found' })).toBeDefined();

    await pressTheButton('Reset filters');

    expect(navigation.url()).toBe('/templates/');
    expect(searchBox().value).toBe('');
    expect(shownTemplates()).toEqual(expect.arrayContaining(['Camping Checklist', 'Moving Day']));
  });

  it('shows the search of an address the user goes back or forward to', async () => {
    await openTheLibraryAt('/templates/?search=moving');
    await act(async () => {
      navigation.router.push('/templates/?search=camping');
    });

    expect(searchBox().value).toBe('camping');
    expect(shownTemplates()).toContain('Camping Checklist');
    expect(shownTemplates()).not.toContain('Moving Day');
  });
});
