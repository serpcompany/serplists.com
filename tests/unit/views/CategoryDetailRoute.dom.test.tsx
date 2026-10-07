import { navigation } from '../../support/mockedNextNavigation';
import React, { act } from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

import CategoryPage from '@/app/(site)/categories/[categorySlug]/page';
import CategoryDetailRoute from '@/views/CategoryDetailRoute';
import { findElementOf } from '../../support/elementTree';

type PageRender = { param: string | undefined; slugAtMount: string | undefined };

const probe = vi.hoisted(() => ({ mounts: 0, renders: [] as PageRender[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/server/pageMeta/categoryPage', () => ({ loadCategoryPageSeo: async () => null }));

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

theInMemoryBrowserAsTheWindow();

beforeEach(() => {
  probe.mounts = 0;
  probe.renders = [];
});
const mountCategoryRoute = (initialPath: string) => {
  navigation.reset(initialPath, { routes: ['/categories/[categorySlug]'] });
  render(<CategoryDetailRoute />);
};

const lastRender = () => probe.renders[probe.renders.length - 1];

describe('category page route', () => {
  it('is the page the category route renders', () => {
    const page = CategoryPage({ params: Promise.resolve({ categorySlug: 'business' }) });

    expect(findElementOf(page, CategoryDetailRoute)).not.toBeNull();
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
