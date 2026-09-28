import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Every page renders inside a route-level error boundary, below the Router and the site
// header, so a page that crashes leaves the navigation usable and clears on navigation.

let currentPath = '/';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  const { StaticRouter } = await vi.importActual<typeof import('react-router-dom/server')>('react-router-dom/server');
  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <StaticRouter location={currentPath}>{children}</StaticRouter>
    ),
  };
});

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

import App from '@/App';

const renderAppAt = (pathname: string) => {
  currentPath = pathname;
  return renderToStaticMarkup(<App />);
};

describe('route-level error boundary placement', () => {
  it('wraps only the page inside Layout, leaving the header outside', () => {
    const html = renderAppAt('/no-such-page');

    expect(html).toContain('<div data-route-boundary="true"><p>Missing page</p></div>');
    expect(html.indexOf('<header')).toBeGreaterThan(-1);
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('data-route-boundary'));
  });

  it('wraps the shared run page, which renders outside Layout', () => {
    const html = renderAppAt('/share/share-token');

    expect(html).toContain('<div data-route-boundary="true"><p>Shared run page</p></div>');
  });
});
