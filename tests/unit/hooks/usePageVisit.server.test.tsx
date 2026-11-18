import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { PageVisit } from '@/lib/navigation/pageVisit';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);

import { usePageVisit } from '@/hooks/usePageVisit';

describe('usePageVisit on the server, where there is no window', () => {
  it('renders the page without a current visit, so nothing started while it renders can navigate', () => {
    let visit: PageVisit | undefined;
    function Page() {
      visit = usePageVisit()();
      return <p>Templates</p>;
    }

    expect(typeof window).toBe('undefined');
    expect(renderToStaticMarkup(<Page />)).toBe('<p>Templates</p>');
    expect(visit?.isCurrent()).toBe(false);
  });
});
