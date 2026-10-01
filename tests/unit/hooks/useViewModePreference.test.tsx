import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useViewModePreference } from '@/hooks/useViewModePreference';
import type { ViewMode } from '@/lib/viewModePreference';

import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';

let restoreGlobals: () => void;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('useViewModePreference', () => {
  it('shows a choice made in one component in every other component showing the same preference', async () => {
    const shown: Record<string, ViewMode> = {};
    let chooseInToolbar: ((value: ViewMode) => void) | undefined;
    function Toolbar() {
      const [viewMode, setViewMode] = useViewModePreference({ surface: 'dashboard-templates', userId: 'user-1' });
      shown.toolbar = viewMode;
      chooseInToolbar = setViewMode;
      return null;
    }
    function TemplateList() {
      const [viewMode] = useViewModePreference({ surface: 'dashboard-templates', userId: 'user-1' });
      shown.list = viewMode;
      return null;
    }
    root = createRoot(createFakeContainer() as unknown as Element);
    await act(async () => {
      root?.render(
        <>
          <Toolbar />
          <TemplateList />
        </>,
      );
    });
    expect(shown).toEqual({ toolbar: 'grid', list: 'grid' });

    await act(async () => {
      chooseInToolbar?.('list');
    });

    expect(shown).toEqual({ toolbar: 'list', list: 'list' });
  });
});
