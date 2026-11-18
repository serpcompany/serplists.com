import React, { StrictMode, useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

import type { PageVisit } from '@/lib/navigation/pageVisit';

import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);

import { usePageVisit } from '@/hooks/usePageVisit';

theInMemoryBrowserAsTheWindow();

describe('usePageVisit', () => {
  it('starts current visits on a page StrictMode mounted, unmounted and mounted again, since the page enters its visit in an effect', async () => {
    navigation.reset('/dashboard/templates/');
    let beginVisit: (() => PageVisit) | undefined;
    function Page() {
      beginVisit = usePageVisit();
      return null;
    }
    await renderSettled(
      <StrictMode>
        <Page />
      </StrictMode>,
    );

    expect(beginVisit?.().isCurrent()).toBe(true);
  });
});

describe('usePageVisit loaded with a window, as in a browser, or with none, as on the server', () => {
  const whatAChildEffectSeesOnTheFirstRender = async (useTheVisit: typeof usePageVisit) => {
    navigation.reset('/dashboard/templates/');
    let seen: boolean | undefined;
    function Child({ beginVisit }: { beginVisit: () => PageVisit }) {
      useEffect(() => {
        seen = beginVisit().isCurrent();
      }, [beginVisit]);
      return null;
    }
    function Page() {
      return <Child beginVisit={useTheVisit()} />;
    }
    await renderSettled(<Page />);
    return seen;
  };

  it('enters the visit before the effects of what the page renders, in a browser', async () => {
    expect(await whatAChildEffectSeesOnTheFirstRender(usePageVisit)).toBe(true);
  });
});
