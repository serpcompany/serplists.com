import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

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
vi.mock('@/lib/analytics', () => ({
  analytics: { track: vi.fn(), trackPageView: vi.fn(), trackTemplateView: vi.fn() },
}));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AppProviders } from '@/App';

describe('App billing status refresh', () => {
  it("reloads billing status in the QueryClient the app's pages read", () => {
    let pageClient: QueryClient | undefined;
    const Probe = () => {
      pageClient = useQueryClient();
      return null;
    };

    renderToStaticMarkup(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );

    expect(registered.clients).toHaveLength(1);
    expect(registered.clients[0]).toBe(pageClient);
  });
});
