import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';

import { useViewModePreference } from '@/hooks/useViewModePreference';
import type { ViewMode } from '@/lib/viewModePreference';

import { createFakeContainer } from '../../fixtures/fakeDom';

const fakeDom = aFakeDomForEachTest();

let root: Root | null = null;
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
    root = fakeDom.track(createRoot(createFakeContainer() as unknown as Element));
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
