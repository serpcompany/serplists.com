import { navigation } from '../../support/mockedNextNavigation';
import '../../support/mockedWorkspaceRoles';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import Dashboard from '@/views/Dashboard';
import { pressTheButton } from '../../support/pressTheButton';
import { queryClientsClearedAfterEachTest } from '../../support/queryClientsPerTest';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

const runsList = vi.hoisted(() => ({ refetchRuns: vi.fn(async () => undefined) }));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplateLists: () => ({
    templates: [],
    allTemplates: [],
    runs: [],
    runsLoading: false,
    runsError: new Error('HTTP 500'),
    refetchRuns: runsList.refetchRuns,
  }),
}));

theInMemoryBrowserAsTheWindow();
const aQueryClient = queryClientsClearedAfterEachTest();

describe('My Runs after the runs failed to load', () => {
  it('loads the runs again when the user presses Retry', async () => {
    navigation.reset('/dashboard/runs/');
    await renderSettled(
      <QueryClientProvider client={aQueryClient()}>
        <Dashboard />
      </QueryClientProvider>,
    );

    await pressTheButton('Retry');

    expect(runsList.refetchRuns).toHaveBeenCalledTimes(1);
  });
});
