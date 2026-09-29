import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Providers } from '@/app/providers';
import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// Checkout can find a plan the cached billing status lacks (access-flow.ts). The app's own
// QueryClient, the one every page reads, must be the one whose billing status is reloaded.

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

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ isAuthenticated: false, isLoading: false, user: null }),
}));
vi.mock('@/contexts/TemplatesContext', () => ({
  TemplatesProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/DevLoginBar', () => ({ DevLoginBar: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// The theme sync writes to the document, which this test has no need for.
vi.mock('@/lib/theme', () => ({
  applyStoredTheme: vi.fn(),
  subscribeToThemeChanges: () => () => undefined,
}));

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(navigation.window);
});
afterAll(() => restoreGlobals());

describe('App billing status refresh', () => {
  it("reloads billing status in the QueryClient the app's pages read", async () => {
    let pageClient: QueryClient | undefined;
    const Probe = () => {
      pageClient = useQueryClient();
      return null;
    };
    navigation.reset('/pricing');
    const root = createRoot(createFakeContainer() as unknown as HTMLElement);

    await act(async () => {
      root.render(
        <Providers>
          <Probe />
        </Providers>,
      );
    });

    expect(registered.clients).toHaveLength(1);
    expect(registered.clients[0]).toBe(pageClient);
    act(() => root.unmount());
  });
});
