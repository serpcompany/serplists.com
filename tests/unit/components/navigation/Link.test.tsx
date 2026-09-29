import React, { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { Link } from '@/components/navigation/Link';
import { subscribeToNavigations } from '@/lib/navigation/navigationSignal';
import { useAppRouter, type AppRouter } from '@/lib/navigation/useAppRouter';
import { useUnsavedChangesGuard } from '@/lib/navigation/useUnsavedChangesGuard';
import { click, createFakeContainer, findByText, installFakeDomGlobals, type FakeElement } from '../../../fixtures/fakeDom';
import { navigation, RoutedPages } from '../../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

// Every in-app link (the app's Link) and every navigation code starts (useAppRouter) asks a
// page holding unsaved work before it opens another page: the sidebar, header and account
// menu links, in-page links and buttons, and redirects after an action. A change of the
// query or hash keeps the page mounted, so it never asks. Each navigation is reported, so a
// page visit ends even on a link to the page already open.

const MESSAGE = 'You have unsaved work. Leave without saving?';

const probe: { router?: AppRouter; setDirty?: (dirty: boolean) => void } = {};

function EditorPage({ initiallyDirty }: { initiallyDirty: boolean }) {
  const [dirty, setDirty] = useState(initiallyDirty);
  const router = useAppRouter();
  useUnsavedChangesGuard(dirty, MESSAGE);
  useEffect(() => {
    probe.setDirty = setDirty;
    probe.router = router;
  }, [router]);
  return (
    <main>
      <Link href="/dashboard/runs">Runs</Link>
      <Link href="/dashboard/templates/t1/edit?section=2#seo">Same page, other section</Link>
      <Link href="/dashboard/templates/t1/edit">This page</Link>
      <Link href="https://docs.example.com/guide">External guide</Link>
      <Link href="/dashboard/settings" onNavigate={(event) => event.preventDefault()}>
        Cancelled by the caller
      </Link>
    </main>
  );
}

let restoreGlobals: () => void = () => {};
let root: Root | null = null;
let container: FakeElement;
const navigations = vi.fn();
let unsubscribe: () => void = () => {};

beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());

beforeEach(() => {
  navigations.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  unsubscribe();
});

const mountEditor = async ({ dirty = true } = {}) => {
  navigation.reset('/dashboard/templates/t1/edit', {
    before: ['/dashboard/templates'],
    routes: ['/dashboard/templates/[id]/edit', '/dashboard/runs', '/dashboard/settings'],
  });
  container = createFakeContainer();
  root = createRoot(container as unknown as HTMLElement);
  await act(async () => {
    root?.render(
      <RoutedPages
        pages={{
          '/dashboard/templates/[id]/edit': <EditorPage initiallyDirty={dirty} />,
          '/dashboard/runs': <p>Runs page</p>,
          '/dashboard/settings': <p>Settings page</p>,
        }}
      />,
    );
  });
  unsubscribe = subscribeToNavigations(navigations);
};

const clickLink = async (label: string, modifiers?: Parameters<typeof click>[2]) => {
  let event: ReturnType<typeof click> | undefined;
  await act(async () => {
    event = click(container, findByText(container, 'A', label), modifiers);
  });
  return event!;
};

describe('Link with unsaved work on the page', () => {
  it('asks before opening another page, and stays when the user cancels', async () => {
    await mountEditor();
    navigation.window.confirm.mockReturnValue(false);

    const event = await clickLink('Runs');

    expect(navigation.window.confirm).toHaveBeenCalledWith(MESSAGE);
    expect(event.defaultPrevented).toBe(true);
    expect(navigation.url()).toBe('/dashboard/templates/t1/edit');
    expect(navigations).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Runs');
  });

  it('opens the page once the user confirms, asking only once', async () => {
    await mountEditor();

    await clickLink('Runs');

    expect(navigation.window.confirm).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/dashboard/runs');
    expect(navigations).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe('Runs page');
  });

  it('never asks for a change of the query or hash, which keeps the page', async () => {
    await mountEditor();

    await clickLink('Same page, other section');

    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/dashboard/templates/t1/edit?section=2#seo');
  });

  it('reports a link to the page already open, which changes nothing a hook can read', async () => {
    await mountEditor();
    const entries = navigation.entries();

    await clickLink('This page');

    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigations).toHaveBeenCalledTimes(1);
    expect(navigation.entries()).toEqual(entries);
    expect(container.textContent).toContain('This page');
  });

  it('asks nothing once the work is saved', async () => {
    await mountEditor({ dirty: false });

    await clickLink('Runs');

    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/dashboard/runs');
  });

  it('leaves external links and new-tab clicks to the browser (beforeunload covers them)', async () => {
    await mountEditor();

    const external = await clickLink('External guide');
    const newTab = await clickLink('Runs', { ctrlKey: true });
    const middle = await clickLink('Runs', { button: 1 });

    expect(external.defaultPrevented).toBe(false);
    expect(newTab.defaultPrevented).toBe(false);
    expect(middle.defaultPrevented).toBe(false);
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/dashboard/templates/t1/edit');
  });

  it("does nothing, and asks nothing, when the caller's onNavigate cancels", async () => {
    await mountEditor();

    const event = await clickLink('Cancelled by the caller');

    expect(event.defaultPrevented).toBe(true);
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigations).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/dashboard/templates/t1/edit');
  });
});

describe('useAppRouter with unsaved work on the page', () => {
  // The page decides once it has rendered its latest state, so push and replace say they
  // did not navigate yet; the page opens the page itself when the user confirms.
  it('asks before push or replace opens another page', async () => {
    await mountEditor();
    navigation.window.confirm.mockReturnValue(false);

    let went: boolean | undefined;
    await act(async () => {
      went = probe.router?.push('/dashboard/runs');
    });
    expect(went).toBe(false);
    expect(navigation.window.confirm).toHaveBeenCalledWith(MESSAGE);
    expect(navigation.url()).toBe('/dashboard/templates/t1/edit');
    expect(navigation.router.push).not.toHaveBeenCalled();

    await act(async () => {
      probe.router?.replace('/dashboard/settings');
    });
    expect(navigation.window.confirm).toHaveBeenCalledTimes(2);
    expect(navigation.url()).toBe('/dashboard/templates/t1/edit');

    navigation.window.confirm.mockReturnValue(true);
    await act(async () => {
      went = probe.router?.replace('/dashboard/settings');
    });
    expect(went).toBe(false);
    expect(navigation.window.confirm).toHaveBeenCalledTimes(3);
    expect(navigation.router.replace).toHaveBeenCalledWith('/dashboard/settings', undefined);
    expect(navigation.url()).toBe('/dashboard/settings');
    expect(navigations).toHaveBeenCalledTimes(1);
  });

  it('navigates right away when nothing is unsaved', async () => {
    await mountEditor({ dirty: false });

    let went: boolean | undefined;
    await act(async () => {
      went = probe.router?.push('/dashboard/runs');
    });

    expect(went).toBe(true);
    expect(navigation.router.push).toHaveBeenCalledWith('/dashboard/runs', undefined);
    expect(navigation.url()).toBe('/dashboard/runs');
  });

  it('never asks for a query change, and reports it', async () => {
    await mountEditor();

    let went: boolean | undefined;
    await act(async () => {
      went = probe.router?.push('/dashboard/templates/t1/edit?preview=1', { scroll: false });
    });

    expect(went).toBe(true);
    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.router.push).toHaveBeenCalledWith('/dashboard/templates/t1/edit?preview=1', { scroll: false });
    expect(navigations).toHaveBeenCalledTimes(1);
  });

  it('lets a page that just saved leave without asking', async () => {
    await mountEditor();

    await act(async () => {
      probe.setDirty?.(false);
    });
    await act(async () => {
      probe.router?.push('/dashboard/runs');
    });

    expect(navigation.window.confirm).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/dashboard/runs');
  });

  it('goes back and refreshes through Next.js, leaving Back to the page guard', async () => {
    await mountEditor({ dirty: false });

    await act(async () => {
      probe.router?.refresh();
      probe.router?.back();
      await navigation.settle();
    });

    expect(navigation.router.refresh).toHaveBeenCalledTimes(1);
    expect(navigation.router.back).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/dashboard/templates');
  });
});
