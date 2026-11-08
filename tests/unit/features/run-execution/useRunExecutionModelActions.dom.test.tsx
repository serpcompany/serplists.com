import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UpdateRun } from '@/features/run-execution/runPersistence';
import { createApiError } from '@/lib/api-errors';
import { HISTORY_FULL_LIMIT } from '@/lib/schemas/historyLimits';
import type { ChecklistRun } from '@/types/checklist';

import { deferred } from '../../../support/deferred';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';
import { renderSettled } from '../../../support/renderInTheDom';

const server = vi.hoisted(() => ({
  createChecklistRunShare: vi.fn(),
  getChecklistById: vi.fn(),
  getChecklistHistory: vi.fn(),
  revokeChecklistRunShare: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: server }));

import { useRunExecutionModel, type UseRunExecutionModelOptions } from '@/features/run-execution/useRunExecutionModel';

const apiRun = (id: string, title = `Run ${id}`) => ({
  id,
  template_id: 'template-1',
  title,
  status: 'in_progress',
  revision: 1,
  sections: [{ id: 'section-1', title: 'Launch', items: [{ id: 'task-a', title: 'Check DNS' }, { id: 'task-b', title: 'Ship it' }] }],
});

const updateRun = vi.fn<UpdateRun>(async (run) => ({ ...run, revision: (run.revision ?? 1) + 1 }));

const openTheRun = (runId: string): UseRunExecutionModelOptions => ({ runId, updateRun });

const unmounts: Array<() => void> = [];
beforeEach(() => {
  Object.values(server).forEach((mock) => mock.mockReset());
  server.getChecklistById.mockImplementation(async (id: string) => apiRun(id));
  server.createChecklistRunShare.mockResolvedValue({ shareToken: 'token-9' });
  server.revokeChecklistRunShare.mockResolvedValue({ success: true });
  server.getChecklistHistory.mockResolvedValue({ runId: 'run-1', events: [] });
  updateRun.mockClear();
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function theRunPage(options = openTheRun('run-1')) {
  const page = await mountQueryHook(() => useRunExecutionModel(options));
  unmounts.push(page.unmount);
  await act(settle);
  return page.current;
}

const run = (page: () => ReturnType<typeof useRunExecutionModel>): ChecklistRun => {
  const shown = page().run;
  if (!shown) throw new Error('The run page shows no run');
  return shown;
};

describe('the run page', () => {
  it('says why the run could not load', async () => {
    server.getChecklistById.mockRejectedValue(createApiError(503, { error: 'Database unavailable' }));

    const page = await theRunPage();

    expect(page().loadError).toBe('Database unavailable');
    expect(page().run).toBeNull();
    expect(page().notFound).toBe(false);
    expect(page().loading).toBe(false);
  });

  it('shares the run at its share link, then stops sharing it', async () => {
    const page = await theRunPage();

    const shared = await act(async () => page().createShare());

    expect(shared).toMatchObject({ kind: 'ok', shareUrl: `${window.location.origin}/share/token-9/` });
    expect(run(page).isPublic).toBe(true);

    const stopped = await act(async () => page().stopSharing());

    expect(stopped.kind).toBe('ok');
    expect(server.revokeChecklistRunShare).toHaveBeenCalledWith('run-1');
    expect(run(page).isPublic).toBe(false);
  });

  it('renames the run', async () => {
    const page = await theRunPage();

    await act(async () => {
      await page().saveTitle('  Launch for Acme  ');
    });

    expect(updateRun.mock.calls.map(([saved, saveOptions]) => [saved.title, saveOptions])).toEqual([['Launch for Acme', { includeTitle: true }]]);
    expect(run(page).title).toBe('Launch for Acme');
  });

  it('puts back notes kept from before a reload, as unsaved', async () => {
    const page = await theRunPage();

    await act(async () => page().restoreNoteDrafts({ 'task-b': 'Waiting on the client' }));

    expect(page().noteDrafts).toEqual({ 'task-b': 'Waiting on the client' });
    expect(page().hasUnsavedNotes).toBe(true);
  });

  it('opens on the first unfinished task after a save when no task was selected', async () => {
    const page = await theRunPage();
    await act(async () => page().setSelectedItemId(null));

    await act(async () => {
      await page().saveItemNotes('task-a', 'Done by Bob');
    });

    expect(page().selectedItemId).toBe('task-a');
  });

  it('reloads the run after a save that another session got in before, and saves again on it', async () => {
    const page = await theRunPage();
    server.getChecklistById.mockResolvedValue({ ...apiRun('run-1', 'Renamed elsewhere'), revision: 2 });
    updateRun.mockRejectedValueOnce(createApiError(409, { code: 'edit_conflict', error: 'Checklist run changed since it was loaded.' }));

    const saved = await act(async () => page().saveItemNotes('task-a', 'Done by Bob'));

    expect(saved.kind).toBe('ok');
    expect(server.getChecklistById).toHaveBeenCalledTimes(2);
    expect(updateRun.mock.calls.map(([sent]) => sent.revision)).toEqual([1, 2]);
    expect(run(page).title).toBe('Renamed elsewhere');
  });

  it('loads the whole history once View all is chosen', async () => {
    const page = await theRunPage();

    await act(async () => {
      page().history.onViewAll();
      await settle();
    });

    expect(page().history.showingAll).toBe(true);
    expect(server.getChecklistHistory).toHaveBeenLastCalledWith('run-1', { limit: HISTORY_FULL_LIMIT });
  });

  it('shows the run now opened, not a slower answer for the one opened before it', async () => {
    const slow = deferred<ReturnType<typeof apiRun>>();
    server.getChecklistById.mockImplementation(async (id: string) => (id === 'run-1' ? slow.promise : apiRun(id)));
    let model: ReturnType<typeof useRunExecutionModel> | undefined;
    function RunPage({ runId }: { runId: string }) {
      model = useRunExecutionModel(openTheRun(runId));
      return null;
    }
    const client = new QueryClient();
    const page = (runId: string) => (
      <QueryClientProvider client={client}>
        <RunPage runId={runId} />
      </QueryClientProvider>
    );
    const shown = await renderSettled(page('run-1'));
    unmounts.push(shown.unmount);

    await act(async () => {
      shown.rerender(page('run-2'));
      await settle();
    });
    await act(async () => {
      slow.resolve(apiRun('run-1'));
      await settle();
    });

    expect(model?.run?.id).toBe('run-2');
  });
});
