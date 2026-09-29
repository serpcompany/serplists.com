import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CategoryDetailRoute from '@/views/CategoryDetailRoute';
import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// Every category page is the same route, so an unkeyed page stayed mounted when a Related
// Categories link (or Back) moved to another category, and its search text and sort kept
// filtering the new category. The category route gives each category its own page, keyed by
// the category, while another spelling of the same category keeps it.

type PageRender = { param: string | undefined; state: string | undefined };

const probe = vi.hoisted(() => ({ mounts: 0, renders: [] as PageRender[] }));

// Stands in for the page: its state is set once per mounted instance, like the page's
// search box and sort, and it renders nothing.
vi.mock('@/views/CategoryDetail', async () => {
  const { useEffect, useState } = await import('react');
  const { useParams } = await import('next/navigation');
  return {
    default: function CategoryDetailProbe() {
      const { categorySlug } = useParams<{ categorySlug: string }>();
      const [mountedFor] = useState(categorySlug);
      probe.renders.push({ param: categorySlug, state: mountedFor });
      useEffect(() => {
        probe.mounts += 1;
      }, []);
      return null;
    },
  };
});

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
beforeEach(() => {
  probe.mounts = 0;
  probe.renders = [];
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

// The route component stays mounted while the params change, so its own key decides.
const mountCategoryRoute = (initialPath: string) => {
  navigation.reset(initialPath, { routes: ['/categories/[categorySlug]'] });
  root = createRoot(createFakeContainer() as unknown as HTMLElement);
  act(() => root!.render(<CategoryDetailRoute />));
};

const lastRender = () => probe.renders[probe.renders.length - 1];

describe('category page route', () => {
  it('is the page the category route renders', () => {
    const page = readFileSync(
      new URL('../../../src/app/(site)/categories/[categorySlug]/page.tsx', import.meta.url),
      'utf8',
    );

    expect(page).toContain('<CategoryDetailRoute />');
  });

  it('starts a fresh page, with no search or sort, for each category', async () => {
    mountCategoryRoute('/categories/business');
    expect(lastRender()).toEqual({ param: 'business', state: 'business' });

    await act(async () => {
      navigation.router.push('/categories/hr');
    });
    expect(lastRender()).toEqual({ param: 'hr', state: 'hr' });
    expect(probe.mounts).toBe(2);

    await act(async () => {
      navigation.router.back();
      await navigation.settle();
    });
    expect(lastRender()).toEqual({ param: 'business', state: 'business' });
  });

  it('keeps the page for another spelling of the same category', async () => {
    mountCategoryRoute('/categories/hr');

    await act(async () => {
      navigation.router.push('/categories/HR');
    });
    expect(lastRender()).toEqual({ param: 'HR', state: 'hr' });
    expect(probe.mounts).toBe(1);
  });
});
