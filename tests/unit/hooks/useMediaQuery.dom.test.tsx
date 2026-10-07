import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from '@/lib/useMediaQuery';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMediaQuery', () => {
  it('subscribes once per query however often the page re-renders', async () => {
    const media = window.matchMedia('(min-width: 1024px)');
    const added = vi.spyOn(media, 'addEventListener');
    const removed = vi.spyOn(media, 'removeEventListener');
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    const seen: boolean[] = [];
    function Layout({ revision }: { revision: number }) {
      seen[revision] = useMediaQuery('(min-width: 1024px)', false);
      return null;
    }
    const { rerender } = render(<Layout revision={0} />);

    for (const revision of [1, 2]) {
      await act(async () => {
        rerender(<Layout revision={revision} />);
      });
    }

    expect(seen).toEqual([true, true, true]);
    expect(added).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it('renders the server value on the server, where there is no viewport', () => {
    function Layout() {
      return <>{useMediaQuery('(min-width: 1024px)', false) ? 'wide' : 'narrow'}</>;
    }

    expect(renderToStaticMarkup(<Layout />)).toBe('narrow');
  });
});
