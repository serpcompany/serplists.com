import React, { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Link } from '@/components/navigation/Link';
import { confirmLeave, keepGuardedWork, leaveAfterConfirmed } from '@/lib/navigation/leaveGuard';
import { useAppRouter, type AppRouter } from '@/lib/navigation/useAppRouter';
import { useUnsavedChangesGuard } from '@/lib/navigation/useUnsavedChangesGuard';
import { click, createFakeContainer, findByText, installFakeDomGlobals, type FakeElement } from '../../../fixtures/fakeDom';
import { navigation, RoutedPages } from '../../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

// A page with unsaved work asks before it is lost, whichever way the user leaves: a link or
// code that opens another page (the app's Link and useAppRouter), browser Back/Forward (a copy
// of the page's history entry), Sign out (the leave-guard registry) and a reload or tab close
// (beforeunload). The page runs under Next.js navigation (tests/support/nextNavigation.tsx),
// mounted with React DOM; each route renders its own page, as the App Router does.

const MESSAGE = 'You have unsaved work. Leave without saving?';

const probe: {
  setDirty?: (dirty: boolean) => void;
  guard?: ReturnType<typeof useUnsavedChangesGuard>;
  router?: AppRouter;
} = {};

function RunPage({ dirty, keepWork }: { dirty: boolean; keepWork?: () => boolean }) {
  const [isDirty, setDirty] = useState(dirty);
  const router = useAppRouter();
  const guard = useUnsavedChangesGuard(isDirty, MESSAGE, keepWork);
  useEffect(() => {
    probe.setDirty = setDirty;
    probe.router = router;
    probe.guard = guard;
  }, [guard, router]);
  return (
    <main>
      <Link href="/">Home</Link>
      <Link href="/runs/r2">Next run</Link>
      <Link href="/runs/r1?task=2#notes">Task 2</Link>
    </main>
  );
}

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
let container: FakeElement;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

// A reload or tab close, as the browser announces it to the page.
const beforeUnloadListeners = () => ({
  fire: () => {
    const event = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(event, 'returnValue', { value: 'unset', writable: true });
    navigation.window.dispatchEvent(event);
    return event as BeforeUnloadEvent;
  },
});

async function mountGuard({ dirty = true, keepWork }: { dirty?: boolean; keepWork?: () => boolean } = {}) {
  navigation.reset('/runs/r1', { before: ['/runs'], routes: ['/', '/runs', '/runs/[id]'] });
  container = createFakeContainer();
  root = createRoot(container as unknown as HTMLElement);
  await act(async () => {
    root?.render(
      <RoutedPages
        pages={{
          '/': <p>Home page</p>,
          '/runs': <p>Runs page</p>,
          '/runs/[id]': <RunPage dirty={dirty} keepWork={keepWork} />,
        }}
      />,
    );
  });
}

const clickLink = (label: string) =>
  act(async () => {
    click(container, findByText(container, 'A', label));
  });

// Browser Back: the traversal lands on a later task, and so does what the page does then.
const goBack = () =>
  act(async () => {
    navigation.window.history.back();
    await navigation.settle();
    await navigation.settle();
  });

describe('useUnsavedChangesGuard', () => {
  it('asks before a link or Back leaves the page, and stays when the user cancels', async () => {
    await mountGuard();
    navigation.window.confirm.mockReturnValue(false);

    await clickLink('Home');
    expect(navigation.window.confirm).toHaveBeenCalledWith(MESSAGE);
    expect(navigation.url()).toBe('/runs/r1');

    await goBack();
    expect(navigation.window.confirm).toHaveBeenCalledTimes(2);
    expect(navigation.url()).toBe('/runs/r1');
    expect(container.textContent).toContain('Next run');

    // Still guarded: a second Back asks again.
    await goBack();
    expect(navigation.window.confirm).toHaveBeenCalledTimes(3);
    expect(navigation.url()).toBe('/runs/r1');

    navigation.window.confirm.mockReturnValue(true);
    await clickLink('Home');
    expect(navigation.window.confirm).toHaveBeenCalledTimes(4);
    expect(navigation.url()).toBe('/');
    expect(container.textContent).toBe('Home page');
  });

  it('leaves in one Back once the user confirms', async () => {
    await mountGuard();

    await goBack();

    expect(navigation.window.confirm).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/runs');
    expect(container.textContent).toBe('Runs page');
  });

  it('asks once before moving to another page on the same route', async () => {
    await mountGuard();

    await clickLink('Next run');

    expect(navigation.window.confirm).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/runs/r2');
  });

  it('lets a search or hash change through, and asks nothing when nothing is unsaved', async () => {
    await mountGuard();
    await clickLink('Task 2');
    expect(navigation.url()).toBe('/runs/r1?task=2#notes');
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    act(() => root?.unmount());

    await mountGuard({ dirty: false });
    await clickLink('Home');
    expect(navigation.url()).toBe('/');
    expect(navigation.window.confirm).not.toHaveBeenCalled();
  });

  // Completing a run saves every note and navigates straight away, before the page has
  // rendered without its drafts: the page decides after that render, so it goes without asking.
  it('lets a navigation through without asking when the work was saved just before it', async () => {
    await mountGuard();

    await act(async () => {
      probe.setDirty?.(false);
      probe.router?.push('/runs');
    });

    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/runs');
  });

  it('still asks when work is unsaved after the step that navigated', async () => {
    await mountGuard();
    navigation.window.confirm.mockReturnValue(false);

    let went: boolean | undefined;
    await act(async () => {
      went = probe.router?.push('/runs');
    });

    expect(went).toBe(false);
    expect(navigation.window.confirm).toHaveBeenCalledWith(MESSAGE);
    expect(navigation.url()).toBe('/runs/r1');
  });

  it('asks on Sign out with the page message, and does not ask again on the way out', async () => {
    await mountGuard();
    const confirmDialog = vi.fn(() => true);

    await act(async () => {
      await leaveAfterConfirmed(async () => {
        probe.router?.push('/');
        return true;
      }, confirmDialog);
    });

    expect(confirmDialog).toHaveBeenCalledWith(MESSAGE);
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/');
  });

  it('asks again after a sign-out the server refused', async () => {
    await mountGuard();

    await act(async () => {
      await leaveAfterConfirmed(() => Promise.resolve(false), () => true);
    });
    navigation.window.confirm.mockReturnValue(false);
    await clickLink('Home');

    expect(navigation.window.confirm).toHaveBeenCalledWith(MESSAGE);
    expect(navigation.url()).toBe('/runs/r1');
    expect(confirmLeave(() => false)).toBe(false);
  });

  it('lets the page leave once after allowLeave, and guards the next page again', async () => {
    await mountGuard();
    probe.guard?.allowLeave();

    await clickLink('Next run');
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/runs/r2');

    navigation.window.confirm.mockReturnValue(false);
    await clickLink('Home');
    expect(navigation.window.confirm).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/runs/r2');

    probe.guard?.allowLeave();
    probe.guard?.guardLeave();
    await clickLink('Home');
    expect(navigation.window.confirm).toHaveBeenCalledTimes(2);
  });

  it('warns before a reload or tab close only while work is unsaved', async () => {
    await mountGuard();
    const unload = beforeUnloadListeners();

    const warned = unload.fire();
    expect(warned.defaultPrevented).toBe(true);
    expect(warned.returnValue).toBe('');

    probe.guard?.allowLeave();
    expect(unload.fire().defaultPrevented).toBe(false);

    probe.guard?.guardLeave();
    await act(async () => probe.setDirty?.(false));
    expect(unload.fire().defaultPrevented).toBe(false);
  });

  it('keeps the work when the session ends in the background, and stops guarding once unmounted', async () => {
    const keepWork = vi.fn(() => true);
    await mountGuard({ keepWork });

    expect(keepGuardedWork()).toBe(true);
    expect(keepWork).toHaveBeenCalledTimes(1);

    act(() => root?.unmount());
    root = null;
    const confirmDialog = vi.fn(() => false);
    expect(confirmLeave(confirmDialog)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(beforeUnloadListeners().fire().defaultPrevented).toBe(false);
  });
});

// Back is guarded by a copy of the page's history entry. It is added once, and Back or a
// navigation away takes it out of the way, so the history reads as it would without a guard.
describe('useUnsavedChangesGuard history entry', () => {
  it('adds one entry however often the work is saved and edited again', async () => {
    await mountGuard();
    expect(navigation.entries()).toEqual(['/runs', '/runs/r1', '/runs/r1']);

    for (const dirty of [false, true, false, true]) {
      await act(async () => probe.setDirty?.(dirty));
    }

    expect(navigation.entries()).toEqual(['/runs', '/runs/r1', '/runs/r1']);
  });

  // Moving to a #fragment (a same-page link, or checkout answering with one) adds an entry
  // above the copy and fires popstate. It stays on the page: it neither asks nor goes back,
  // and neither does Back from it onto the copy. Back past the copy still asks.
  it('lets the page move to a #fragment and back without asking', async () => {
    await mountGuard();
    navigation.window.confirm.mockReturnValue(false);

    await act(async () => {
      navigation.window.history.pushState(null, '', '/runs/r1#notes');
      navigation.window.dispatchEvent(Object.assign(new Event('popstate'), { state: null }));
      await navigation.settle();
    });
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/runs/r1#notes');

    await goBack();
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/runs/r1');
    expect(navigation.index()).toBe(2);

    await goBack();
    expect(navigation.window.confirm).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/runs/r1');
    expect(container.textContent).toContain('Next run');
  });

  it('goes back in one step once the work is saved', async () => {
    await mountGuard();
    await act(async () => probe.setDirty?.(false));

    await goBack();

    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/runs');
  });

  it('replaces the copy when a link leaves, so Back from the next page finds the page once', async () => {
    await mountGuard();

    await clickLink('Home');

    expect(navigation.entries()).toEqual(['/runs', '/runs/r1', '/']);
    expect(navigation.index()).toBe(2);
  });

  it('replaces the copy when code leaves after the work was saved', async () => {
    await mountGuard();
    await act(async () => probe.setDirty?.(false));

    await act(async () => {
      probe.router?.push('/');
    });

    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.entries()).toEqual(['/runs', '/runs/r1', '/']);
  });

  it('adds nothing for a page that never held unsaved work', async () => {
    await mountGuard({ dirty: false });
    expect(navigation.entries()).toEqual(['/runs', '/runs/r1']);

    await goBack();

    expect(navigation.url()).toBe('/runs');
    expect(navigation.window.confirm).not.toHaveBeenCalled();
  });
});
