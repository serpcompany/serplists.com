import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider, useSearchParams } from 'react-router-dom';
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

// Drives the page boundary under a real data router: a page crashes, the user clicks the
// fallback's home link (a router Link), and the router navigates the way it does in the
// browser. Only auth is faked.

let authUser: { id: string } | null = null;

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: authUser }),
}));

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

// The page under test. It throws while `pageBroken` is set, as a page does on a bad row.
let pageBroken = false;
let pageRenders = 0;
let pageMounts = 0;
let changeSearch: ((value: string) => void) | null = null;

function Page() {
  pageRenders += 1;
  const [, setSearchParams] = useSearchParams();
  changeSearch = (value) => setSearchParams({ scope: value });
  useEffect(() => {
    pageMounts += 1;
  }, []);
  if (pageBroken) throw new Error('bad template row');
  return <main>Page ok</main>;
}

// As Layout does: the boundary wraps the Outlet, so it stays mounted across the page routes.
const routes = [
  {
    element: (
      <RouteErrorBoundary>
        <Outlet />
      </RouteErrorBoundary>
    ),
    children: [
      { path: '/', element: <Page /> },
      { path: '/dashboard/templates', element: <Page /> },
    ],
  },
];

let root: Root | null = null;

async function renderAt(entry: string) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  const container = createFakeContainer();
  root = createRoot(container as unknown as HTMLElement);
  await act(async () => {
    root?.render(<RouterProvider router={router} />);
  });
  return {
    router,
    container,
    text: () => container.textContent,
    hasAlert: () => findAll(container, (node) => node instanceof FakeElement && node.getAttribute('role') === 'alert').length > 0,
    link: (label: string) => findByText(container, 'A', label),
  };
}

// Lets the router finish the navigation and React commit it.
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('RouteErrorBoundary', () => {
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    authUser = null;
    pageBroken = false;
    pageRenders = 0;
    pageMounts = 0;
    changeSearch = null;
    vi.restoreAllMocks();
  });

  const silenceCaughtErrors = () => vi.spyOn(console, 'error').mockImplementation(() => {});

  it('recovers when a signed-in user clicks Go to My Templates on My Templates itself', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageBroken = true;
    const page = await renderAt('/dashboard/templates');
    expect(page.hasAlert()).toBe(true);

    pageBroken = false;
    await act(async () => {
      const event = click(page.container, page.link('Go to My Templates'));
      expect(event.defaultPrevented).toBe(true);
    });
    await settle();

    expect(page.router.state.location.pathname).toBe('/dashboard/templates');
    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('recovers when a visitor clicks Go to home on the home page itself', async () => {
    silenceCaughtErrors();
    pageBroken = true;
    const page = await renderAt('/');
    expect(page.hasAlert()).toBe(true);

    pageBroken = false;
    await act(async () => {
      click(page.container, page.link('Go to home'));
    });
    await settle();

    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('recovers when the home link differs from the crashed page only by its query', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageBroken = true;
    const page = await renderAt('/dashboard/templates?scope=team');
    expect(page.hasAlert()).toBe(true);

    pageBroken = false;
    await act(async () => {
      click(page.container, page.link('Go to My Templates'));
    });
    await settle();

    expect(page.router.state.location.search).toBe('');
    expect(page.hasAlert()).toBe(false);
    expect(page.text()).toContain('Page ok');
  });

  it('shows the card again, once, when the page still crashes after the click', async () => {
    silenceCaughtErrors();
    authUser = { id: 'user-1' };
    pageBroken = true;
    const page = await renderAt('/dashboard/templates');

    await act(async () => {
      click(page.container, page.link('Go to My Templates'));
    });
    await settle();
    const rendersAfterRetry = pageRenders;
    await settle();

    expect(page.hasAlert()).toBe(true);
    expect(pageRenders).toBe(rendersAfterRetry);
  });

  it('never remounts a healthy page when it navigates to itself or changes its query', async () => {
    const page = await renderAt('/dashboard/templates');
    expect(page.text()).toContain('Page ok');
    expect(pageMounts).toBe(1);

    await act(async () => {
      await page.router.navigate('/dashboard/templates', { replace: true });
    });
    await act(async () => {
      changeSearch?.('team');
    });
    await settle();

    expect(page.router.state.location.search).toBe('?scope=team');
    expect(pageMounts).toBe(1);
    expect(page.text()).toContain('Page ok');
  });
});
