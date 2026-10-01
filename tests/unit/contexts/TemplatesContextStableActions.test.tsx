import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { firstOf } from '../../support/elements';

import type { ChecklistRun, TemplatesContextProps } from '@/types/checklist';

import { createFakeContainer } from '../../fixtures/fakeDom';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';
import { settle } from '../../support/queryHookProbe';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: {} }));
import { providerWorkspace } from '../../support/templatesProviderHarness';
import { TemplatesProvider, useTemplates } from '@/contexts/TemplatesContext';
import { markRunShared, queryKeys } from '@/lib/queryCache';

afterEach(() => {
  providerWorkspace.activeTeamId = undefined;
  providerWorkspace.workspaceScopeId = 'personal';
});

const fakeDom = aFakeDomForEachTest();

const privateRun: ChecklistRun = {
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch checklist',
  status: 'in_progress',
  progress: 0,
  sections: [{ id: 'section-1', title: 'Checklist', items: [{ id: 'item-1', title: 'First task' }] }],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
  revision: 1,
  isPublic: false,
};

const actionsOf = (context: TemplatesContextProps) => ({
  updateRun: context.updateRun,
  deleteRun: context.deleteRun,
  revalidateRun: context.revalidateRun,
  markRunShared: context.markRunShared,
  deleteTemplate: context.deleteTemplate,
  importTemplates: context.importTemplates,
  createRun: context.createRun,
  createTemplate: context.createTemplate,
  updateTemplate: context.updateTemplate,
});

function mountProvider(queryClient: QueryClient) {
  let context: TemplatesContextProps | undefined;
  const Probe = () => {
    context = useTemplates();
    return null;
  };
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>
  );
  const root = fakeDom.track(createRoot(createFakeContainer()));
  act(() => root.render(tree()));
  return {
    context: () => {
      if (!context) throw new Error('TemplatesProvider did not render');
      return context;
    },
    rerender: () => act(() => root.render(tree())),
  };
}

describe('TemplatesProvider actions, which pages key effects on, so a new identity would reload an open run and lose its unsaved task notes', () => {
  it('keep their identity when a share marks the run public in the cached runs list', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['runs', 'user-1', 'personal'], [privateRun]);
    const { context } = mountProvider(queryClient);
    const before = actionsOf(context());
    const runsBefore = context().runs;
    expect(runsBefore).toEqual([privateRun]);

    await act(async () => {
      await markRunShared(queryClient, 'run-1');
      await settle();
    });

    expect(context().runs).not.toBe(runsBefore);
    expect(firstOf(context().runs).isPublic).toBe(true);
    for (const [name, action] of Object.entries(actionsOf(context()))) {
      expect(action, name).toBe(before[name as keyof typeof before]);
    }
  });

  it('keep their identity when the active context switches', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['runs', 'user-1', 'personal'], [privateRun]);
    const { context, rerender } = mountProvider(queryClient);
    const before = actionsOf(context());
    const templatesBefore = context().allTemplates;

    providerWorkspace.activeTeamId = 'team-1';
    providerWorkspace.workspaceScopeId = 'team-1';
    rerender();

    expect(context().allTemplates).not.toBe(templatesBefore);
    for (const [name, action] of Object.entries(actionsOf(context()))) {
      expect(action, name).toBe(before[name as keyof typeof before]);
    }
  });
});

describe('TemplatesProvider markRunShared (the runs list Share)', () => {
  it("marks the run shared and refreshes that run's Changelog, which the share wrote to, so a run page reopened within 60 seconds shows it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['runs', 'user-1', 'personal'], [privateRun]);
    const history = [...queryKeys.runHistory('run-1'), { limit: 8 }];
    const otherHistory = [...queryKeys.runHistory('run-2'), { limit: 8 }];
    queryClient.setQueryData(history, { events: [] });
    queryClient.setQueryData(otherHistory, { events: [] });
    const { context } = mountProvider(queryClient);

    await act(async () => {
      context().markRunShared?.('run-1');
      await settle();
    });

    expect(firstOf(context().runs).isPublic).toBe(true);
    expect(queryClient.getQueryState(history)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherHistory)?.isInvalidated).toBe(false);
  });
});
