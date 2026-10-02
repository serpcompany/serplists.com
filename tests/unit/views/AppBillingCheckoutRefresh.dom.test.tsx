import { navigation } from '../../support/mockedNextNavigation';
import { appShell } from '../../support/appShellInPlace';
import React from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { Providers } from '@/app/providers';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

const registered = vi.hoisted(() => ({ clients: [] as unknown[] }));

vi.mock('@/lib/access-flow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/access-flow')>();
  return {
    ...actual,
    refreshBillingStatusOnCheckoutConflict: (client: QueryClient) => {
      registered.clients.push(client);
      return actual.refreshBillingStatusOnCheckoutConflict(client);
    },
  };
});

vi.mock('@/lib/theme', () => ({
  applyStoredTheme: vi.fn(),
  subscribeToThemeChanges: () => () => undefined,
}));

appShell.auth = { isAuthenticated: false, isLoading: false, user: null };

theInMemoryBrowserAsTheWindow();

describe('App billing status refresh after checkout finds a plan the cached status lacks', () => {
  it("reloads billing status in the QueryClient the app's pages read", async () => {
    let pageClient: QueryClient | undefined;
    const Probe = () => {
      pageClient = useQueryClient();
      return null;
    };
    navigation.reset('/pricing');

    const { unmount } = await renderSettled(
      <Providers>
        <Probe />
      </Providers>,
    );

    expect(registered.clients).toHaveLength(1);
    expect(registered.clients[0]).toBe(pageClient);
    unmount();
  });
});
