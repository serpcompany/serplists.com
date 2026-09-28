import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Stripe returns buyers to /account?billing=success on sessions created before the
// return URL moved, and bookmarks use the other legacy paths. The redirects must keep
// the query string and hash, or Billing never sees ?billing= and cannot confirm Pro.

let currentPath = '/';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const { StaticRouter } = await vi.importActual<typeof import('react-router-dom/server')>('react-router-dom/server');
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <StaticRouter location={currentPath}>{children}</StaticRouter>
    ),
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

import App from '@/App';

const redirectTargetFrom = (path: string): unknown => {
  currentPath = path;
  const html = renderToStaticMarkup(<App />);
  const match = html.match(/<output>(.*?)<\/output>/);
  return match ? JSON.parse(match[1].replace(/&quot;/g, '"')) : null;
};

describe('App legacy redirects', () => {
  it('keeps the Stripe billing result when /account redirects to settings', () => {
    expect(redirectTargetFrom('/account?billing=success')).toEqual({
      pathname: '/dashboard/settings',
      search: '?billing=success',
      hash: '',
    });
  });

  it('keeps the query string and hash when /dashboard/profile redirects to settings', () => {
    expect(redirectTargetFrom('/dashboard/profile?billing=cancel#billing')).toEqual({
      pathname: '/dashboard/settings',
      search: '?billing=cancel',
      hash: '#billing',
    });
  });

  it('keeps the query string when /console redirects to the dashboard', () => {
    expect(redirectTargetFrom('/console?tab=runs')).toEqual({
      pathname: '/dashboard',
      search: '?tab=runs',
      hash: '',
    });
  });
});
