import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderDataRoutes } from '../../fixtures/renderDataRoutes';

// Stripe returns buyers to /account?billing=success on sessions created before the
// return URL moved, and bookmarks use the other legacy paths. The redirects must keep
// the query string and hash, or Billing never sees ?billing= and cannot confirm Pro.

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    // Navigate only acts in an effect, which static rendering skips, so record its target.
    Navigate: ({ to }: { to: unknown }) => <output>{JSON.stringify(to)}</output>,
  };
});

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 'user-1' } }),
}));
vi.mock('@/contexts/TemplatesContext', () => ({
  TemplatesProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/Layout', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { Layout: ({ children }: { children?: React.ReactNode }) => children ?? <Outlet /> };
});
vi.mock('@/components/RequireAuth', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { default: ({ children }: { children?: React.ReactNode }) => children ?? <Outlet /> };
});
vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/DevLoginBar', () => ({ DevLoginBar: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/lib/analytics', () => ({
  analytics: { track: vi.fn(), trackPageView: vi.fn(), trackTemplateView: vi.fn() },
}));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AppProviders } from '@/App';
import { appRoutes } from '@/appRoutes';

// The app's providers and routes under a data router, as App renders them in the browser.
const redirectTargetFrom = async (path: string): Promise<unknown> => {
  const html = await renderDataRoutes(appRoutes, path, (router) => <AppProviders>{router}</AppProviders>);
  const match = html.match(/<output>(.*?)<\/output>/);
  return match ? JSON.parse(match[1].replace(/&quot;/g, '"')) : null;
};

describe('App legacy redirects', () => {
  it('keeps the Stripe billing result when /account redirects to settings', async () => {
    expect(await redirectTargetFrom('/account?billing=success')).toEqual({
      pathname: '/dashboard/settings',
      search: '?billing=success',
      hash: '',
    });
  });

  it('keeps the query string and hash when /dashboard/profile redirects to settings', async () => {
    expect(await redirectTargetFrom('/dashboard/profile?billing=cancel#billing')).toEqual({
      pathname: '/dashboard/settings',
      search: '?billing=cancel',
      hash: '#billing',
    });
  });

  it('keeps the query string when /console redirects to the dashboard', async () => {
    expect(await redirectTargetFrom('/console?tab=runs')).toEqual({
      pathname: '/dashboard',
      search: '?tab=runs',
      hash: '',
    });
  });
});
