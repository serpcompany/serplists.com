import { describe, expect, it, vi } from 'vitest';
import {
  applyRouteScroll,
  decideRouteScroll,
  type RouteScrollTarget,
} from '@/components/routing/routeScroll';

// Client-side navigations keep the window's scroll unless something resets it, so a
// link near the bottom of a long page used to open the next page scrolled down.

describe('decideRouteScroll', () => {
  it('scrolls to the top when a link pushes a new pathname', () => {
    expect(
      decideRouteScroll({
        previousPathname: '/templates',
        pathname: '/categories/seo',
        hash: '',
        navigationType: 'PUSH',
      }),
    ).toEqual({ kind: 'top' });
  });

  it('scrolls to the top when a redirect replaces the pathname', () => {
    expect(
      decideRouteScroll({
        previousPathname: '/dashboard',
        pathname: '/dashboard/templates',
        hash: '',
        navigationType: 'REPLACE',
      }),
    ).toEqual({ kind: 'top' });
  });

  it('scrolls to the top when only a route param changes', () => {
    expect(
      decideRouteScroll({
        previousPathname: '/categories/seo',
        pathname: '/categories/local-seo',
        hash: '',
        navigationType: 'PUSH',
      }),
    ).toEqual({ kind: 'top' });
  });

  it('keeps the scroll on a search-only change, such as typing in the library search', () => {
    expect(
      decideRouteScroll({
        previousPathname: '/templates',
        pathname: '/templates',
        hash: '',
        navigationType: 'REPLACE',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('keeps the browser restoration on Back and Forward', () => {
    expect(
      decideRouteScroll({
        previousPathname: '/categories/seo',
        pathname: '/templates',
        hash: '',
        navigationType: 'POP',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('leaves the first page load to the browser', () => {
    expect(
      decideRouteScroll({
        previousPathname: null,
        pathname: '/templates',
        hash: '#faq',
        navigationType: 'POP',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('targets the anchor when the new URL has a hash', () => {
    expect(
      decideRouteScroll({
        previousPathname: '/templates',
        pathname: '/profile/serp/launch',
        hash: '#section%20two',
        navigationType: 'PUSH',
      }),
    ).toEqual({ kind: 'anchor', id: 'section two' });
  });

  it('keeps a malformed hash as its raw id', () => {
    expect(
      decideRouteScroll({
        previousPathname: '/a',
        pathname: '/b',
        hash: '#%E0%A4%A',
        navigationType: 'PUSH',
      }),
    ).toEqual({ kind: 'anchor', id: '%E0%A4%A' });
  });
});

describe('applyRouteScroll', () => {
  const createTarget = (element: { scrollIntoView: () => void } | null = null) => {
    const target: RouteScrollTarget = {
      scrollTo: vi.fn(),
      getElementById: vi.fn(() => element),
    };
    return target;
  };

  it('scrolls the window to the top instantly', () => {
    const target = createTarget();
    applyRouteScroll({ kind: 'top' }, target);
    expect(target.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('does nothing for a navigation that keeps the scroll', () => {
    const target = createTarget();
    applyRouteScroll({ kind: 'none' }, target);
    expect(target.scrollTo).not.toHaveBeenCalled();
    expect(target.getElementById).not.toHaveBeenCalled();
  });

  it('scrolls the anchor into view when it is on the page', () => {
    const element = { scrollIntoView: vi.fn() };
    const target = createTarget(element);
    applyRouteScroll({ kind: 'anchor', id: 'faq' }, target);
    expect(target.getElementById).toHaveBeenCalledWith('faq');
    expect(element.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(target.scrollTo).not.toHaveBeenCalled();
  });

  it('falls back to the top when the anchor is not on the page', () => {
    const target = createTarget(null);
    applyRouteScroll({ kind: 'anchor', id: 'missing' }, target);
    expect(target.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });
});
