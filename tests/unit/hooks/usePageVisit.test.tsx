import React, { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PageVisit } from '@/lib/navigation/pageVisit';

import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);

import { usePageVisit } from '@/hooks/usePageVisit';

let restoreGlobals: () => void;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('usePageVisit', () => {
  it('starts current visits on a page StrictMode mounted, unmounted and mounted again, since the page enters its visit in an effect', async () => {
    navigation.reset('/dashboard/templates/');
    let beginVisit: (() => PageVisit) | undefined;
    function Page() {
      beginVisit = usePageVisit();
      return null;
    }
    root = createRoot(createFakeContainer() as unknown as Element);

    await act(async () => {
      root?.render(
        <StrictMode>
          <Page />
        </StrictMode>,
      );
    });

    expect(beginVisit?.().isCurrent()).toBe(true);
  });
});
