import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderDataRoutes } from '../../fixtures/renderDataRoutes';

// Every page renders inside a route-level error boundary, below the Router and the site
// header, so a page that crashes leaves the navigation usable and clears on navigation.

vi.mock('@/components/RouteErrorBoundary', () => ({
  RouteErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-route-boundary="true">{children}</div>
  ),
}));

vi.mock('@/pages/ChecklistRun', () => ({ default: () => <p>Shared run page</p> }));
vi.mock('@/pages/NotFound', () => ({ default: () => <p>Missing page</p> }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({ logout: vi.fn(), user: null }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  TemplatesProvider: ({ children }: { children: React.ReactNode }) => children,
  useTemplates: () => ({ templates: [], templatesLoading: false }),
}));

vi.mock('@/contexts/WorkspaceContext', () => {
  const personal = { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' };
  return {
    WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
    useWorkspace: () => ({
      activeWorkspace: personal,
      isWorkspaceLoading: false,
      selectWorkspace: vi.fn(),
      workspaces: [personal],
    }),
  };
});

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/DevLoginBar', () => ({ DevLoginBar: () => null }));
vi.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: () => vi.fn(() => []) }),
}));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AppProviders } from '@/App';
import { appRoutes } from '@/appRoutes';

// The app's providers and routes under a data router, as App renders them in the browser.
const renderAppAt = (pathname: string): Promise<string> =>
  renderDataRoutes(appRoutes, pathname, (router) => <AppProviders>{router}</AppProviders>);

describe('route-level error boundary placement', () => {
  it('wraps only the page inside Layout, leaving the header outside', async () => {
    const html = await renderAppAt('/no-such-page');

    expect(html).toContain('<div data-route-boundary="true"><p>Missing page</p></div>');
    expect(html.indexOf('<header')).toBeGreaterThan(-1);
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('data-route-boundary'));
  });

  it('wraps the shared run page, which renders outside Layout', async () => {
    const html = await renderAppAt('/share/share-token');

    expect(html).toContain('<div data-route-boundary="true"><p>Shared run page</p></div>');
  });
});
