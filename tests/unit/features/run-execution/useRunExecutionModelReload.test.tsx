import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { aFakeDomForEachTest } from '../../../support/fakeDomRoots';

import type { RunExecutionApiClient } from '@/features/run-execution/runPersistence';
import type { UseRunExecutionModelOptions } from '@/features/run-execution/useRunExecutionModel';
import type { ChecklistRun } from '@/types/checklist';

import { createFakeContainer } from '../../../fixtures/fakeDom';

vi.mock('@/lib/api', () => ({
  api: { getChecklistHistory: vi.fn(() => new Promise(() => {})) },
}));

import { useRunExecutionModel } from '@/features/run-execution/useRunExecutionModel';

const fakeDom = aFakeDomForEachTest();

let root: Root | null = null;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const storedRun = (id: string) => ({
  id,
  template_id: 'template-1',
  title: `Run ${id}`,
  status: 'in_progress',
  revision: 1,
  items: JSON.stringify([
    {
      id: 'section-1',
      title: 'Checklist',
      items: [
        { id: 'item-1', title: 'First task' },
        { id: 'item-2', title: 'Second task' },
        { id: 'item-3', title: 'Third task' },
      ],
    },
  ]),
});

const apiClient = (): RunExecutionApiClient & { getChecklistById: ReturnType<typeof vi.fn> } => ({
  createChecklistRunShare: vi.fn(),
  getChecklistById: vi.fn((id: string) => Promise.resolve(storedRun(id))),
  getSharedChecklist: vi.fn(),
  revokeChecklistRunShare: vi.fn(),
  updateSharedChecklist: vi.fn(),
});

type Model = ReturnType<typeof useRunExecutionModel>;

async function mountModel(initial: UseRunExecutionModelOptions) {
  const loadingSeen: boolean[] = [];
  let model: Model | undefined;
  function Probe({ options }: { options: UseRunExecutionModelOptions }) {
    model = useRunExecutionModel(options);
    loadingSeen.push(model.loading);
    return null;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = fakeDom.track(createRoot(createFakeContainer()));
  const render = async (options: UseRunExecutionModelOptions) => {
    await act(async () => {
      root?.render(
        <QueryClientProvider client={client}>
          <Probe options={options} />
        </QueryClientProvider>,
      );
      await flush();
    });
  };
  await render(initial);
  return {
    loadingSeen,
    model: () => {
      if (!model) throw new Error('The model did not render');
      return model;
    },
    render,
  };
}

const savedRun = (run: ChecklistRun) => Promise.resolve(run);

describe("run page model, whose updateRun from the Templates context changes identity whenever Share or a context switch changes the cached lists", () => {
  it('keeps the run, the unsaved notes only it holds and the selection, without a reload, when updateRun changes identity, and saves with the new one', async () => {
    const client = apiClient();
    const firstUpdateRun = vi.fn(savedRun);
    const { loadingSeen, model, render } = await mountModel({
      runId: 'run-1',
      updateRun: firstUpdateRun,
      dependencies: { apiClient: client },
    });
    expect(model().loading).toBe(false);
    expect(model().run?.id).toBe('run-1');

    await act(async () => {
      model().setNoteDraft('item-1', 'Deployed build 42');
      model().setSelectedItemId('item-3');
    });
    loadingSeen.length = 0;

    const updateRunAfterTheCachedListsChanged = vi.fn(savedRun);
    await render({ runId: 'run-1', updateRun: updateRunAfterTheCachedListsChanged, dependencies: { apiClient: client } });

    expect(client.getChecklistById).toHaveBeenCalledTimes(1);
    expect(loadingSeen).not.toContain(true);
    expect(model().noteDrafts).toEqual({ 'item-1': 'Deployed build 42' });
    expect(model().hasUnsavedNotes).toBe(true);
    expect(model().selectedItemId).toBe('item-3');

    await act(async () => {
      await model().saveItemNotes('item-1', 'Deployed build 42');
    });
    expect(updateRunAfterTheCachedListsChanged).toHaveBeenCalledTimes(1);
    expect(firstUpdateRun).not.toHaveBeenCalled();
    expect(model().noteDrafts).toEqual({});
  });

  it('still loads another run afresh, without the notes typed on the first', async () => {
    const client = apiClient();
    const { model, render } = await mountModel({
      runId: 'run-1',
      updateRun: vi.fn(savedRun),
      dependencies: { apiClient: client },
    });
    await act(async () => {
      model().setNoteDraft('item-1', 'Typed on run 1');
      model().setSelectedItemId('item-3');
    });

    await render({ runId: 'run-2', updateRun: vi.fn(savedRun), dependencies: { apiClient: client } });

    expect(client.getChecklistById).toHaveBeenCalledTimes(2);
    expect(client.getChecklistById).toHaveBeenLastCalledWith('run-2');
    expect(model().run?.id).toBe('run-2');
    expect(model().noteDrafts).toEqual({});
    expect(model().selectedItemId).toBe('item-1');
  });
});
