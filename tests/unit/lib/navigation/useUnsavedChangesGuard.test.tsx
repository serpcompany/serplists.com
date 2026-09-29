import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { confirmLeave, keepGuardedWork, leaveAfterConfirmed } from '@/lib/navigation/leaveGuard';
import { useUnsavedChangesGuard } from '@/lib/navigation/useUnsavedChangesGuard';

// A page with unsaved work asks before it is lost, whichever way the user leaves: a link or
// browser Back/Forward (useBlocker, which needs a data router), Sign out (the leave-guard
// registry) and a reload or tab close (beforeunload). The hook runs here under a real memory
// data router, mounted with React DOM.

const MESSAGE = 'You have unsaved work. Leave without saving?';

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
const confirm = vi.fn<(message: string) => boolean>();
const unloadListeners = new Set<(event: BeforeUnloadEvent) => void>();
const globals = globalThis as Record<string, unknown>;
const savedGlobals = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };

beforeAll(() => {
  globals.window = {
    HTMLIFrameElement: class {},
    document: fakeDocument,
    confirm,
    addEventListener: (type: string, listener: (event: BeforeUnloadEvent) => void) => {
      if (type === 'beforeunload') unloadListeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: BeforeUnloadEvent) => void) => {
      if (type === 'beforeunload') unloadListeners.delete(listener);
    },
  };
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
  unloadListeners.clear();
  confirm.mockReset();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function mountGuard({ dirty = true, keepWork }: { dirty?: boolean; keepWork?: () => boolean } = {}) {
  const probe: {
    setDirty?: (dirty: boolean) => void;
    guard?: ReturnType<typeof useUnsavedChangesGuard>;
  } = {};
  function Page() {
    const [isDirty, setDirty] = useState(dirty);
    probe.setDirty = setDirty;
    probe.guard = useUnsavedChangesGuard(isDirty, MESSAGE, keepWork);
    return null;
  }
  const router = createMemoryRouter(
    [
      { path: '/', element: null },
      { path: '/runs', element: null },
      { path: '/runs/:id', element: <Page /> },
    ],
    { initialEntries: ['/runs', '/runs/r1'], initialIndex: 1 },
  );
  root = createRoot(fakeContainer as unknown as Element);
  // As in the app, which does not opt in to v7_startTransition.
  act(() => root?.render(<RouterProvider future={{ v7_startTransition: false }} router={router} />));
  const navigate = async (to: string | number) => {
    await act(async () => {
      await (typeof to === 'number' ? router.navigate(to) : router.navigate(to));
      await flush();
    });
  };
  const at = () => `${router.state.location.pathname}${router.state.location.search}${router.state.location.hash}`;
  return { navigate, at, probe, router };
}

const unloadEvent = () => ({ preventDefault: vi.fn(), returnValue: 'unset' }) as unknown as BeforeUnloadEvent;

describe('useUnsavedChangesGuard', () => {
  it('asks before a link or Back leaves the page, and stays when the user cancels', async () => {
    const { navigate, at } = mountGuard();
    confirm.mockReturnValue(false);

    await navigate('/');
    expect(confirm).toHaveBeenCalledWith(MESSAGE);
    expect(at()).toBe('/runs/r1');

    await navigate(-1);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(at()).toBe('/runs/r1');

    confirm.mockReturnValue(true);
    await navigate('/');
    expect(confirm).toHaveBeenCalledTimes(3);
    expect(at()).toBe('/');
  });

  it('asks once before moving to another page on the same route', async () => {
    const { navigate, at } = mountGuard();
    confirm.mockReturnValue(true);

    await navigate('/runs/r2');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(at()).toBe('/runs/r2');
  });

  it('lets a search or hash change through, and asks nothing when nothing is unsaved', async () => {
    const guarded = mountGuard();
    await guarded.navigate('/runs/r1?task=2#notes');
    expect(guarded.at()).toBe('/runs/r1?task=2#notes');
    expect(confirm).not.toHaveBeenCalled();
    act(() => root?.unmount());

    const clean = mountGuard({ dirty: false });
    await clean.navigate('/');
    expect(clean.at()).toBe('/');
    expect(confirm).not.toHaveBeenCalled();
  });

  // Completing a run saves every note and navigates straight away, before the page has
  // rendered without its drafts: the blocker still holds the old answer.
  it('lets a navigation through without asking when the work was saved just before it', async () => {
    const { at, probe, router } = mountGuard();

    await act(async () => {
      probe.setDirty?.(false);
      await router.navigate('/runs');
      await flush();
    });

    expect(confirm).not.toHaveBeenCalled();
    expect(at()).toBe('/runs');
  });

  it('asks on Sign out with the page message, and does not ask again on the way out', async () => {
    const { at, router } = mountGuard();
    const confirmDialog = vi.fn(() => true);

    await act(async () => {
      await leaveAfterConfirmed(async () => {
        await router.navigate('/');
        return true;
      }, confirmDialog);
      await flush();
    });

    expect(confirmDialog).toHaveBeenCalledWith(MESSAGE);
    expect(confirm).not.toHaveBeenCalled();
    expect(at()).toBe('/');
  });

  it('asks again after a sign-out the server refused', async () => {
    const { navigate, at } = mountGuard();

    await act(async () => {
      await leaveAfterConfirmed(() => Promise.resolve(false), () => true);
    });
    confirm.mockReturnValue(false);
    await navigate('/');

    expect(confirm).toHaveBeenCalledWith(MESSAGE);
    expect(at()).toBe('/runs/r1');
    expect(confirmLeave(() => false)).toBe(false);
  });

  it('lets the page leave once after allowLeave, and guards the next page again', async () => {
    const { navigate, at, probe } = mountGuard();
    probe.guard?.allowLeave();

    await navigate('/runs/r2');
    expect(confirm).not.toHaveBeenCalled();
    expect(at()).toBe('/runs/r2');

    confirm.mockReturnValue(false);
    await navigate('/');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(at()).toBe('/runs/r2');

    probe.guard?.allowLeave();
    probe.guard?.guardLeave();
    await navigate('/');
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('warns before a reload or tab close only while work is unsaved', () => {
    const { probe } = mountGuard();
    const warned = unloadEvent();
    unloadListeners.forEach((listener) => listener(warned));
    expect(warned.preventDefault).toHaveBeenCalled();
    expect(warned.returnValue).toBe('');

    probe.guard?.allowLeave();
    const allowed = unloadEvent();
    unloadListeners.forEach((listener) => listener(allowed));
    expect(allowed.preventDefault).not.toHaveBeenCalled();

    act(() => probe.setDirty?.(false));
    expect(unloadListeners.size).toBe(0);
  });

  it('keeps the work when the session ends in the background, and stops guarding once unmounted', () => {
    const keepWork = vi.fn(() => true);
    mountGuard({ keepWork });

    expect(keepGuardedWork()).toBe(true);
    expect(keepWork).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = null;
    const confirmDialog = vi.fn(() => false);
    expect(confirmLeave(confirmDialog)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(unloadListeners.size).toBe(0);
  });
});
