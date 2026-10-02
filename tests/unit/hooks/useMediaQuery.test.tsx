import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from '@/lib/useMediaQuery';

import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';

const media = {
  matches: true,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

let restoreGlobals: () => void;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals({
    matchMedia: () => media,
    addEventListener() {},
    removeEventListener() {},
  });
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('useMediaQuery', () => {
  it('subscribes once per query however often the page re-renders', async () => {
    const seen: boolean[] = [];
    function Layout({ revision }: { revision: number }) {
      seen[revision] = useMediaQuery('(min-width: 1024px)', false);
      return null;
    }
    root = createRoot(createFakeContainer());

    for (const revision of [0, 1, 2]) {
      await act(async () => {
        root?.render(<Layout revision={revision} />);
      });
    }

    expect(seen).toEqual([true, true, true]);
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener).not.toHaveBeenCalled();
  });

  it('renders the server value on the server, where there is no viewport', () => {
    function Layout() {
      return <>{useMediaQuery('(min-width: 1024px)', false) ? 'wide' : 'narrow'}</>;
    }

    expect(renderToStaticMarkup(<Layout />)).toBe('narrow');
  });
});
