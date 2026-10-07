import React, { act } from 'react';
import { describe, expect, it } from 'vitest';
import { renderSettled } from '../../support/renderInTheDom';

import { useViewModePreference } from '@/hooks/useViewModePreference';
import type { ViewMode } from '@/lib/viewModePreference';

describe('useViewModePreference', () => {
  it('shows a choice made in one component in every other component showing the same preference', async () => {
    const shown: { toolbar?: ViewMode; list?: ViewMode } = {};
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
    await renderSettled(
      <>
        <Toolbar />
        <TemplateList />
      </>,
    );
    expect(shown).toEqual({ toolbar: 'grid', list: 'grid' });

    await act(async () => {
      chooseInToolbar?.('list');
    });

    expect(shown).toEqual({ toolbar: 'list', list: 'list' });
  });
});
