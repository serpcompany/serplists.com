import React, { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';

import type { PageVisit } from '@/lib/navigation/pageVisit';

import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);

import { usePageVisit } from '@/hooks/usePageVisit';

const fakeDom = aFakeDomForEachTest(navigation.window);

describe('usePageVisit', () => {
  it('starts current visits on a page StrictMode mounted, unmounted and mounted again, since the page enters its visit in an effect', async () => {
    navigation.reset('/dashboard/templates/');
    let beginVisit: (() => PageVisit) | undefined;
    function Page() {
      beginVisit = usePageVisit();
      return null;
    }
    await fakeDom.render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );

    expect(beginVisit?.().isCurrent()).toBe(true);
  });
});
