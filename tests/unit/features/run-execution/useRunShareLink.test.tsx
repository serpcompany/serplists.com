import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RunExecutionActionResult } from '@/features/run-execution/runExecutionResult';
import { useRunShareLink } from '@/features/run-execution/useRunShareLink';

import { createFakeContainer, installFakeDomGlobals } from '../../../fixtures/fakeDom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

type ShownRun = { runId: string; isPublic: boolean };

async function mountShareLink(initial: ShownRun) {
  let minted = 0;
  const createShare = vi.fn(
    async (): Promise<RunExecutionActionResult> => ({
      kind: 'ok',
      shareUrl: `https://serplists.com/share/token-${++minted}`,
    }),
  );
  const stopSharing = vi.fn(async (): Promise<RunExecutionActionResult> => ({ kind: 'ok' }));
  let state: ReturnType<typeof useRunShareLink> | undefined;
  function Probe({ runId, isPublic }: ShownRun) {
    state = useRunShareLink(runId, { createShare, stopSharing }, isPublic);
    return null;
  }
  root = createRoot(createFakeContainer() as unknown as Element);
  const render = async (shown: ShownRun) => {
    await act(async () => {
      root?.render(<Probe {...shown} />);
    });
  };
  await render(initial);
  const current = () => {
    if (!state) throw new Error('The hook did not render');
    return state;
  };
  return {
    createShare,
    current,
    render,
    closeDialog: async () => {
      await act(async () => current().setIsShareDialogOpen(false));
    },
    share: async () => {
      await act(async () => {
        await current().createShareLink();
      });
    },
  };
}

describe("the run page share link, which each Share replaces and stopping sharing kills", () => {
  it('reopens the link it made while the run is shown shared', async () => {
    const page = await mountShareLink({ runId: 'run-1', isPublic: false });
    await page.share();
    await page.render({ runId: 'run-1', isPublic: true });
    expect(page.current().shareUrl).toBe('https://serplists.com/share/token-1');
    await page.closeDialog();

    await page.share();

    expect(page.createShare).toHaveBeenCalledTimes(1);
    expect(page.current().isShareDialogOpen).toBe(true);
    expect(page.current().shareUrl).toBe('https://serplists.com/share/token-1');
  });

  it('makes a new link once the page reloads the run as private, as after another tab stopped sharing it', async () => {
    const page = await mountShareLink({ runId: 'run-1', isPublic: false });
    await page.share();
    await page.render({ runId: 'run-1', isPublic: true });
    await page.closeDialog();

    await page.render({ runId: 'run-1', isPublic: false });
    expect(page.current().shareUrl).toBe('');
    await page.share();

    expect(page.createShare).toHaveBeenCalledTimes(2);
    expect(page.current().isShareDialogOpen).toBe(true);
    expect(page.current().shareUrl).toBe('https://serplists.com/share/token-2');
  });

  it('closes the dialog when the run it shows a link for is shown private', async () => {
    const page = await mountShareLink({ runId: 'run-1', isPublic: false });
    await page.share();
    await page.render({ runId: 'run-1', isPublic: true });
    expect(page.current().isShareDialogOpen).toBe(true);

    await page.render({ runId: 'run-1', isPublic: false });

    expect(page.current().isShareDialogOpen).toBe(false);
    expect(page.current().shareUrl).toBe('');
  });

  it('does not bring its old link back when the run was stopped and shared again elsewhere, which killed that link', async () => {
    const page = await mountShareLink({ runId: 'run-1', isPublic: false });
    await page.share();
    await page.render({ runId: 'run-1', isPublic: true });
    await page.closeDialog();

    await page.render({ runId: 'run-1', isPublic: false });
    await page.render({ runId: 'run-1', isPublic: true });
    await page.share();

    expect(page.createShare).toHaveBeenCalledTimes(2);
    expect(page.current().shareUrl).toBe('https://serplists.com/share/token-2');
  });
});
