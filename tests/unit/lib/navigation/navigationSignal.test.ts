import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportNavigation, subscribeToNavigations } from '@/lib/navigation/navigationSignal';

// Next.js has no location key: a link to the page that is already open changes nothing a hook
// can read. The app's Link and useAppRouter report each navigation they start here, and
// browser Back/Forward report through popstate, so a page visit (usePageVisit) ends on them.

const unsubscribes: Array<() => void> = [];
const subscribe = (listener: () => void) => {
  const unsubscribe = subscribeToNavigations(listener);
  unsubscribes.push(unsubscribe);
  return unsubscribe;
};

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
});

afterEach(() => {
  unsubscribes.splice(0).forEach((unsubscribe) => unsubscribe());
  vi.unstubAllGlobals();
});

describe('navigation signal', () => {
  it('tells every listener about a navigation the app starts', () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribe(first);
    subscribe(second);

    reportNavigation();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('counts browser Back and Forward as navigations', () => {
    const listener = vi.fn();
    subscribe(listener);

    window.dispatchEvent(new Event('popstate'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops telling a listener once it unsubscribes, for both kinds', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    unsubscribe();
    reportNavigation();
    window.dispatchEvent(new Event('popstate'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('is a no-op with no listeners, as on the server', () => {
    vi.unstubAllGlobals();

    expect(() => reportNavigation()).not.toThrow();
  });
});
