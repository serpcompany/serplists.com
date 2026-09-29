import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistRun } from '@/types/checklist';

const { createChecklistRunShare } = vi.hoisted(() => ({ createChecklistRunShare: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { createChecklistRunShare } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useRunsDashboardSharing } from '@/features/dashboard-runs/useRunsDashboardSharing';

// Each Share replaces the run's token, so the runs list reopens the link it made instead of
// minting another. A teammate or another tab can stop sharing the run, which kills that link.
// Once the refreshed list shows the run private, Share Run must make the run public again
// with a new link instead of handing out the dead one.

// Vitest runs in node with no DOM. The probe renders nothing, so React DOM needs only a
// container object, and a window while it commits, to run effects.
const fakeDocument = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
const fakeContainer = {
  nodeType: 1,
  nodeName: 'DIV',
  tagName: 'DIV',
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  ownerDocument: fakeDocument,
  addEventListener() {},
  removeEventListener() {},
};
const globals = globalThis as Record<string, unknown>;
const savedGlobals = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };

beforeAll(() => {
  globals.window = {
    HTMLIFrameElement: class {},
    document: fakeDocument,
    location: { origin: 'https://serplists.com' },
    addEventListener() {},
    removeEventListener() {},
  };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globals.window = savedGlobals.window;
  globals.IS_REACT_ACT_ENVIRONMENT = savedGlobals.act;
});

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
  root = createRoot(fakeContainer as unknown as Element);
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

describe('sharing from the runs list', () => {
  it('reopens the link it made while the list shows the run shared', async () => {
    const list = await mountRunsList([listedRun('run-1', false)]);
    await list.share('run-1');
    // markRunShared marks the run public in the cached list.
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

  it('makes a new link once the refreshed list shows the run private', async () => {
    const list = await mountRunsList([listedRun('run-1', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true)]);
    await list.closeDialog();

    // A teammate stopped sharing; the list refetched on focus.
    await list.render([listedRun('run-1', false)]);
    expect(list.current().sharedLink).toBeNull();
    await list.share('run-1');

    expect(createChecklistRunShare).toHaveBeenCalledTimes(2);
    expect(list.current().isShareDialogOpen).toBe(true);
    expect(list.current().sharedLink?.url).toBe('https://serplists.com/share/token-2/');
  });

  it('does not bring the old link back when the run is later listed shared again', async () => {
    const list = await mountRunsList([listedRun('run-1', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true)]);
    await list.closeDialog();

    // Stopped elsewhere, then shared elsewhere with a new token: the first link is dead.
    await list.render([listedRun('run-1', false)]);
    await list.render([listedRun('run-1', true)]);
    await list.share('run-1');

    expect(createChecklistRunShare).toHaveBeenCalledTimes(2);
    expect(list.current().sharedLink?.url).toBe('https://serplists.com/share/token-2/');
  });

  it('forgets the link, and closes its dialog, when the run leaves the list', async () => {
    const list = await mountRunsList([listedRun('run-1', false), listedRun('run-2', false)]);
    await list.share('run-1');
    await list.render([listedRun('run-1', true), listedRun('run-2', false)]);
    expect(list.current().isShareDialogOpen).toBe(true);

    // Archived or deleted elsewhere.
    await list.render([listedRun('run-2', false)]);

    expect(list.current().sharedLink).toBeNull();
    expect(list.current().isShareDialogOpen).toBe(false);
  });
});
