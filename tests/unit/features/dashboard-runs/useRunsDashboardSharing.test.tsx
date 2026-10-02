import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistRun } from '@/types/checklist';

import { createFakeContainer, installFakeDomGlobals } from '../../../fixtures/fakeDom';

const { createChecklistRunShare } = vi.hoisted(() => ({ createChecklistRunShare: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { createChecklistRunShare } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useRunsDashboardSharing } from '@/features/dashboard-runs/useRunsDashboardSharing';

let restoreGlobals: () => void;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals({
    location: { origin: 'https://serplists.com' },
    addEventListener() {},
    removeEventListener() {},
  });
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
beforeEach(() => {
  let minted = 0;
  createChecklistRunShare.mockReset();
  createChecklistRunShare.mockImplementation(async () => ({ shareToken: `token-${++minted}` }));
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

const listedRun = (id: string, isPublic: boolean): ChecklistRun => ({
  id,
  templateId: 'template-1',
  title: `Run ${id}`,
  status: 'in_progress',
  progress: 0,
  sections: [],
  startedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-1',
  isPublic,
});

async function mountRunsList(initial: ChecklistRun[]) {
  let state: ReturnType<typeof useRunsDashboardSharing> | undefined;
  function Probe({ runs }: { runs: ChecklistRun[] }) {
    state = useRunsDashboardSharing({ runs, onStopSharingRun: async () => undefined });
    return null;
  }
  root = createRoot(createFakeContainer() as unknown as Element);
  const render = async (runs: ChecklistRun[]) => {
    await act(async () => {
      root?.render(<Probe runs={runs} />);
    });
  };
  await render(initial);
  const current = () => {
    if (!state) throw new Error('The hook did not render');
    return state;
  };
  return {
    current,
    render,
    closeDialog: async () => {
      await act(async () => current().setIsShareDialogOpen(false));
    },
    share: async (runId: string) => {
      await act(async () => {
        await current().shareRun(runId);
      });
    },
  };
}

describe("sharing from the runs list, where each Share replaces the run's token and stopping sharing kills the link", () => {
  it('reopens the link it made while the list shows the run shared', async () => {
    const list = await mountRunsList([listedRun('run-1', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true)]);
    await list.closeDialog();

    await list.share('run-1');

    expect(createChecklistRunShare).toHaveBeenCalledTimes(1);
    expect(list.current().isShareDialogOpen).toBe(true);
    expect(list.current().sharedLink?.url).toBe('https://serplists.com/share/token-1/');
  });

  it('keeps a new link while the list has not yet caught up with the share', async () => {
    const runs = [listedRun('run-1', false)];
    const list = await mountRunsList(runs);
    await list.share('run-1');
    await list.render(runs);

    expect(list.current().isShareDialogOpen).toBe(true);
    expect(list.current().sharedLink?.url).toBe('https://serplists.com/share/token-1/');
  });

  it('makes a new link once the list refetches the run as private, as after a teammate stopped sharing it', async () => {
    const list = await mountRunsList([listedRun('run-1', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true)]);
    await list.closeDialog();

    await list.render([listedRun('run-1', false)]);
    expect(list.current().sharedLink).toBeNull();
    await list.share('run-1');

    expect(createChecklistRunShare).toHaveBeenCalledTimes(2);
    expect(list.current().isShareDialogOpen).toBe(true);
    expect(list.current().sharedLink?.url).toBe('https://serplists.com/share/token-2/');
  });

  it('does not bring its old link back when the run was stopped and shared again elsewhere, which killed that link', async () => {
    const list = await mountRunsList([listedRun('run-1', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true)]);
    await list.closeDialog();

    await list.render([listedRun('run-1', false)]);
    await list.render([listedRun('run-1', true)]);
    await list.share('run-1');

    expect(createChecklistRunShare).toHaveBeenCalledTimes(2);
    expect(list.current().sharedLink?.url).toBe('https://serplists.com/share/token-2/');
  });

  it('forgets the link once Stop sharing succeeds, since that link no longer works, so the next Share makes a new one', async () => {
    const list = await mountRunsList([listedRun('run-1', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true)]);
    await list.closeDialog();

    await act(async () => {
      await list.current().stopSharing('run-1');
    });

    expect(list.current().sharedLink).toBeNull();
    await list.share('run-1');
    expect(createChecklistRunShare).toHaveBeenCalledTimes(2);
    expect(list.current().sharedLink?.url).toBe('https://serplists.com/share/token-2/');
  });

  it('forgets the link, and closes its dialog, when the run is deleted elsewhere and leaves the list', async () => {
    const list = await mountRunsList([listedRun('run-1', false), listedRun('run-2', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true), listedRun('run-2', false)]);
    expect(list.current().isShareDialogOpen).toBe(true);

    await list.render([listedRun('run-2', false)]);

    expect(list.current().sharedLink).toBeNull();
    expect(list.current().isShareDialogOpen).toBe(false);
  });
});
