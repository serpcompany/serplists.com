import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RunExecutionActionResult } from '@/features/run-execution/runExecutionResult';
import { useRunShareLink } from '@/features/run-execution/useRunShareLink';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Each Share replaces the run's token, so the run page reopens the link it made instead of
// minting another. Another tab or a teammate can stop sharing the run, which kills that link.
// Once the page shows the run private (it reloads the run after an edit conflict), Share must
// make a new link instead of handing out the dead one.

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
  globals.window = { HTMLIFrameElement: class {}, document: fakeDocument, addEventListener() {}, removeEventListener() {} };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globals.window = savedGlobals.window;
  globals.IS_REACT_ACT_ENVIRONMENT = savedGlobals.act;
});

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
  root = createRoot(fakeContainer as unknown as Element);
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

describe('the run page share link', () => {
  it('reopens the link it made while the run is shown shared', async () => {
    const page = await mountShareLink({ runId: 'run-1', isPublic: false });
    await page.share();
    // The share result marks the run public on the page.
    await page.render({ runId: 'run-1', isPublic: true });
    expect(page.current().shareUrl).toBe('https://serplists.com/share/token-1');
    await page.closeDialog();

    await page.share();

    expect(page.createShare).toHaveBeenCalledTimes(1);
    expect(page.current().isShareDialogOpen).toBe(true);
    expect(page.current().shareUrl).toBe('https://serplists.com/share/token-1');
  });

  it('makes a new link once the run is shown private, as after sharing was stopped elsewhere', async () => {
    const page = await mountShareLink({ runId: 'run-1', isPublic: false });
    await page.share();
    await page.render({ runId: 'run-1', isPublic: true });
    await page.closeDialog();

    // Another tab stopped sharing; the page reloaded the run after an edit conflict.
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

  it('does not bring the old link back when the run is later shown shared again', async () => {
    const page = await mountShareLink({ runId: 'run-1', isPublic: false });
    await page.share();
    await page.render({ runId: 'run-1', isPublic: true });
    await page.closeDialog();

    // Stopped elsewhere, then shared elsewhere with a new token: the first link is dead.
    await page.render({ runId: 'run-1', isPublic: false });
    await page.render({ runId: 'run-1', isPublic: true });
    await page.share();

    expect(page.createShare).toHaveBeenCalledTimes(2);
    expect(page.current().shareUrl).toBe('https://serplists.com/share/token-2');
  });
});
