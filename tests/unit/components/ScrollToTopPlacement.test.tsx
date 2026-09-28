import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// The scroll reset must be mounted once inside the Router, so every route (public
// shell, console shell, the shared run page and the 404 page) starts at the top after
// a link click.

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

vi.mock('@/components/routing/ScrollToTop', async () => {
  const { useLocation } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ScrollToTop: () => {
      // useLocation throws outside a Router, so rendering at all proves the placement.
      const { pathname } = useLocation();
      return <i data-scroll-reset={pathname} />;
    },
  };
});

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

const countResets = (html: string) => html.split('data-scroll-reset=').length - 1;

describe('route scroll reset placement', () => {
  it('is mounted once, inside the Router, before the page on a Layout route', () => {
    const html = renderAppAt('/no-such-page');

    expect(countResets(html)).toBe(1);
    expect(html).toContain('data-scroll-reset="/no-such-page"');
    expect(html.indexOf('data-scroll-reset')).toBeLessThan(html.indexOf('Missing page'));
  });

  it('is mounted on the shared run page, which renders outside Layout', () => {
    const html = renderAppAt('/share/share-token');

    expect(countResets(html)).toBe(1);
    expect(html).toContain('data-scroll-reset="/share/share-token"');
  });
});
