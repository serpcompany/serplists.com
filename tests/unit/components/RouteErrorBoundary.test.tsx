import { navigation, RoutedPages } from '../../support/mockedNextNavigation';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useSearchParams } from 'next/navigation';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';

import {
  click,
  createFakeContainer,
  FakeElement,
  findAll,
  findByText,
  installFakeDomGlobals,
} from '../../fixtures/fakeDom';

let authUser: { id: string } | null = null;

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());

let pageThrowsOnABadRow = false;
const pageRendered = vi.fn();
let pageMounts = 0;

function PageReadingItsQueryLikeTheLibrary() {
  pageRendered();
  useSearchParams();
  useEffect(() => {
    pageMounts += 1;
  }, []);
  if (pageThrowsOnABadRow) throw new Error('bad template row');
  return <main>Page ok</main>;
}

const boundaryAroundRoutedPagesAsInLayout = (
  <RouteErrorBoundary>
    <RoutedPages
      pages={{ '/': <PageReadingItsQueryLikeTheLibrary />, '/dashboard/templates': <PageReadingItsQueryLikeTheLibrary /> }}
    />
  </RouteErrorBoundary>
);

let root: Root | null = null;

async function renderAt(entry: string) {
  navigation.reset(entry);
  const container = createFakeContainer();
  root = createRoot(container as unknown as HTMLElement);
  await act(async () => {
    root?.render(boundaryAroundRoutedPagesAsInLayout);
  });
  return {
    container,
    text: () => container.textContent,
    hasAlert: () => findAll(container, (node) => node instanceof FakeElement && node.getAttribute('role') === 'alert').length > 0,
    link: (label: string) => findByText(container, 'A', label),
  };
}

const finishNavigation = () =>
  act(async () => {
    await navigation.settle();
  });

describe('RouteErrorBoundary', () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    authUser = null;
    pageThrowsOnABadRow = false;
    pageRendered.mockClear();
    pageMounts = 0;
    vi.restoreAllMocks();
  });

  const silenceCaughtErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('recovers when a signed-in user clicks Go to My Templates on My Templates itself', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageThrowsOnABadRow = true;
    const page = await renderAt('/dashboard/templates/');
    expect(page.hasAlert()).toBe(true);

    pageThrowsOnABadRow = false;
    await act(async () => {
      const event = click(page.container, page.link('Go to My Templates'));
      expect(event.defaultPrevented).toBe(true);
    });
    await finishNavigation();

    expect(navigation.pathname()).toBe('/dashboard/templates/');
    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('recovers when a visitor clicks Go to home on the home page itself', async () => {
    silenceCaughtErrors();
    pageThrowsOnABadRow = true;
    const page = await renderAt('/');
    expect(page.hasAlert()).toBe(true);

    pageThrowsOnABadRow = false;
    await act(async () => {
      click(page.container, page.link('Go to home'));
    });
    await finishNavigation();

    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('recovers when the home link differs from the crashed page only by its query', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageThrowsOnABadRow = true;
    const page = await renderAt('/dashboard/templates/?scope=team');
    expect(page.hasAlert()).toBe(true);

    pageThrowsOnABadRow = false;
    await act(async () => {
      click(page.container, page.link('Go to My Templates'));
    });
    await finishNavigation();

    expect(navigation.search()).toBe('');
    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('shows the card again, once, when the page still crashes after the click', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageThrowsOnABadRow = true;
    const page = await renderAt('/dashboard/templates/');

    await act(async () => {
      click(page.container, page.link('Go to My Templates'));
    });
    await finishNavigation();
    const rendersAfterRetry = pageRendered.mock.calls.length;
    await finishNavigation();

    expect(page.hasAlert()).toBe(true);
    expect(pageRendered).toHaveBeenCalledTimes(rendersAfterRetry);
  });

  it('never remounts a healthy page when it navigates to itself or changes its query', async () => {
    const page = await renderAt('/dashboard/templates/');
    expect(page.text()).toContain('Page ok');
    expect(pageMounts).toBe(1);

    await act(async () => {
      navigation.router.replace('/dashboard/templates/');
    });
    await act(async () => {
      navigation.router.replace('/dashboard/templates/?scope=team');
    });
    await finishNavigation();

    expect(navigation.search()).toBe('?scope=team');
    expect(pageMounts).toBe(1);
    expect(page.text()).toContain('Page ok');
  });
});
