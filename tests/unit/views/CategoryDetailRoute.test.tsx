import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { appRoutes } from '@/appRoutes';

// Every category page is the same route, so an unkeyed page stayed mounted when a Related
// Categories link (or Back) moved to another category, and its search text and sort kept
// filtering the new category. The real route config must give each category its own page.

type PageRender = { param: string | undefined; state: string | undefined };

const probe = vi.hoisted(() => ({ mounts: 0, renders: [] as PageRender[] }));

// Stands in for the page: its state is set once per mounted instance, like the page's
// search box and sort, and it renders nothing, so React DOM needs no real document.
vi.mock('@/views/CategoryDetail', async () => {
  const { useEffect, useState } = await import('react');
  const { useParams } = await import('react-router-dom');
  return {
    default: function CategoryDetailProbe() {
      const { categorySlug } = useParams();
      const [mountedFor] = useState(categorySlug);
      probe.renders.push({ param: categorySlug, state: mountedFor });
      useEffect(() => {
        probe.mounts += 1;
      }, []);
      return null;
    },
  };
});

// Other pages in the route config track page views on import, which needs a browser.
vi.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: () => vi.fn(() => []) }),
}));

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
beforeEach(() => {
  probe.mounts = 0;
  probe.renders = [];
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

const findRoute = (routes: RouteObject[], path: string): RouteObject | undefined => {
  for (const route of routes) {
    if (route.path === path) return route;
    const child = route.children ? findRoute(route.children, path) : undefined;
    if (child) return child;
  }
  return undefined;
};

const mountCategoryRoute = (initialPath: string) => {
  const categoryRoute = findRoute(appRoutes, '/categories/:categorySlug');
  expect(categoryRoute?.element).toBeTruthy();
  const router = createMemoryRouter(
    [{ path: '/categories/:categorySlug', element: categoryRoute?.element }],
    { initialEntries: [initialPath] },
  );
  root = createRoot(fakeContainer as unknown as HTMLElement);
  act(() => root!.render(<RouterProvider router={router} />));
  return router;
};

const lastRender = () => probe.renders[probe.renders.length - 1];

describe('category page route', () => {
  it('starts a fresh page, with no search or sort, for each category', async () => {
    const router = mountCategoryRoute('/categories/business');
    expect(lastRender()).toEqual({ param: 'business', state: 'business' });

    await act(() => router.navigate('/categories/hr'));
    expect(lastRender()).toEqual({ param: 'hr', state: 'hr' });
    expect(probe.mounts).toBe(2);

    await act(() => router.navigate(-1));
    expect(lastRender()).toEqual({ param: 'business', state: 'business' });
  });

  it('keeps the page for another spelling of the same category', async () => {
    const router = mountCategoryRoute('/categories/hr');

    await act(() => router.navigate('/categories/HR'));
    expect(lastRender()).toEqual({ param: 'HR', state: 'hr' });
    expect(probe.mounts).toBe(1);
  });
});
