import { act } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { THEME_CHANGE_EVENT, toggleDocumentTheme, useDocumentTheme } from '@/lib/theme';
import { renderSettled } from '../../support/renderInTheDom';

function ThemeShown() {
  return <p>{useDocumentTheme()}</p>;
}

const fromAnotherTab = (event: Event) =>
  act(() => {
    window.dispatchEvent(event);
  });

describe('the theme a component reads from the page', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
  });

  it('follows the theme toggle, and the page when it says only that the theme changed', async () => {
    await renderSettled(<ThemeShown />);
    expect(screen.getByText('light')).toBeTruthy();

    act(() => {
      toggleDocumentTheme();
    });
    expect(screen.getByText('dark')).toBeTruthy();

    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
    await fromAnotherTab(new Event(THEME_CHANGE_EVENT));
    expect(screen.getByText('light')).toBeTruthy();
  });

  it('goes back to the stored theme when another tab clears the site data, and keeps it when another tab changes something else', async () => {
    await renderSettled(<ThemeShown />);
    act(() => {
      toggleDocumentTheme();
    });

    await fromAnotherTab(new StorageEvent('storage', { key: 'other-key', newValue: 'light', storageArea: window.localStorage }));
    expect(screen.getByText('dark')).toBeTruthy();

    window.localStorage.clear();
    await fromAnotherTab(new Event('storage'));
    expect(screen.getByText('dark')).toBeTruthy();

    window.localStorage.clear();
    await fromAnotherTab(new StorageEvent('storage', { key: null }));
    expect(screen.getByText('light')).toBeTruthy();
  });
});
