import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentLocationPath, replaceCurrentUrl } from '@/lib/navigation/replaceCurrentUrl';

const stubHistory = () => {
  const received: Array<Record<string, unknown> | null> = [];
  const replaceState = vi.fn((state: Record<string, unknown> | null) => {
    received.push(state);
    if (state) state['__NA'] = true;
  });
  vi.stubGlobal('window', {
    history: { replaceState },
    location: { pathname: '/login/', search: '?next=%2Fdashboard%2F', hash: '#form' },
  });
  return { received, replaceState };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('replaceCurrentUrl', () => {
  it('hands the History API a copy of the state, since Next.js adds its router state to the object it gets', () => {
    const { received, replaceState } = stubHistory();
    const state = { email: 'ada@example.com' };

    replaceCurrentUrl('/login/', state);

    expect(replaceState).toHaveBeenCalledWith(expect.anything(), '', '/login/');
    expect(received[0]).not.toBe(state);
    expect(received[0]).toEqual({ email: 'ada@example.com', __NA: true });
    expect(state).toEqual({ email: 'ada@example.com' });
  });

  it('clears the entry state when none is given', () => {
    const { replaceState } = stubHistory();

    replaceCurrentUrl('/templates/?q=seo');

    expect(replaceState).toHaveBeenCalledWith(null, '', '/templates/?q=seo');
  });
});

describe('currentLocationPath', () => {
  it('reads the pathname, query and hash when it is called', () => {
    stubHistory();

    expect(currentLocationPath()).toBe('/login/?next=%2Fdashboard%2F#form');
  });
});
