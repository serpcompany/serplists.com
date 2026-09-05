import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRunExecutionModel } from '../../../src/features/run-execution/useRunExecutionModel';
import type { ChecklistRun } from '../../../src/types/checklist';

// Test-only browser module. Deferred dependencies isolate completion ordering in
// the real React hook; real Worker/D1 persistence is covered separately.
export async function mutationNavigationScenario(mode: 'private' | 'shared', navigation: 'change' | 'return' | 'stay') {
  const buildRun = (id: string): ChecklistRun => ({ id, templateId: 'template', title: id, status: 'in_progress', progress: 0, startedAt: '2026-09-05', userId: 'fixture', revision: 1, templateVersion: 1,
    sections: [{ id: 'section', title: 'Section', items: [{ id: `${id}-first`, title: 'First', isCompleted: false }, { id: `${id}-selected`, title: 'Selected', isCompleted: false }] }],
  });
  const runs = { first: buildRun('first'), second: buildRun(mode === 'shared' ? 'first' : 'second') };
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const updateRun = async (run: ChecklistRun) => { await delayed; return { ...run, revision: 2 }; };
  const apiClient = {
    getChecklistById: async () => { throw new Error('Private fixture must load from cache'); },
    getSharedChecklist: async (token: string) => ({ ...runs[token as keyof typeof runs], items: runs[token as keyof typeof runs].sections }),
    updateSharedChecklist: async () => { await delayed; return { revision: 2 }; },
    createChecklistRunShare: async () => ({ shareToken: 'unused' }),
  } as unknown as NonNullable<Parameters<typeof useRunExecutionModel>[0]['dependencies']>['apiClient'];
  let model!: ReturnType<typeof useRunExecutionModel>;
  function Harness({ route }: { route: 'first' | 'second' }) {
    model = useRunExecutionModel({ ...(mode === 'private' ? { runId: route, getCachedRun: (id: string) => runs[id as keyof typeof runs] } : { shareToken: route }), updateRun, dependencies: { apiClient } });
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = (route: 'first' | 'second') => flushSync(() => root.render(<QueryClientProvider client={queryClient}><Harness route={route} /></QueryClientProvider>));
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
  try {
    render('first');
    await settle();
    if (!model.run || model.loading) throw new Error('Initial hook load failed');
    const pending = model.saveItemNotes('first-first', 'late mutation');
    if (navigation !== 'stay') {
      render('second');
      await settle();
      if (navigation === 'return') { render('first'); await settle(); }
    }
    const expectedId = navigation === 'change' && mode === 'private' ? 'second' : 'first';
    flushSync(() => model.setSelectedItemId(`${expectedId}-selected`));
    release();
    await pending;
    await settle();
    return { id: model.run?.id, revision: model.run?.revision, notes: model.run?.sections[0].items[0].notes ?? '', selected: model.selectedItemId, expectedId };
  } finally {
    root.unmount();
    queryClient.clear();
    container.remove();
  }
}
