import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import CategoryDetailRoute from '@/views/CategoryDetailRoute';
import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

type PageRender = { param: string | undefined; slugAtMount: string | undefined };

const probe = vi.hoisted(() => ({ mounts: 0, renders: [] as PageRender[] }));

vi.mock('@/views/CategoryDetail', async () => {
  const { useEffect, useState } = await import('react');
  const { useParams } = await import('next/navigation');
  return {
    default: function CategoryPageWithStateSetOnMountLikeItsSearchAndSort() {
      const { categorySlug } = useParams<{ categorySlug: string }>();
      const [slugAtMount] = useState(categorySlug);
      probe.renders.push({ param: categorySlug, slugAtMount });
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
    expect(lastRender()).toEqual({ param: 'business', slugAtMount: 'business' });

    await act(async () => {
      navigation.router.push('/categories/hr');
    });
    expect(lastRender()).toEqual({ param: 'hr', slugAtMount: 'hr' });
    expect(probe.mounts).toBe(2);

    await act(async () => {
      navigation.router.back();
      await navigation.settle();
    });
    expect(lastRender()).toEqual({ param: 'business', slugAtMount: 'business' });
  });

  it('keeps the page for another spelling of the same category', async () => {
    mountCategoryRoute('/categories/hr');

    await act(async () => {
      navigation.router.push('/categories/HR');
    });
    expect(lastRender()).toEqual({ param: 'HR', slugAtMount: 'hr' });
    expect(probe.mounts).toBe(1);
  });
});
