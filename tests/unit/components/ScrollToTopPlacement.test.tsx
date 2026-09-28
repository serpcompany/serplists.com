import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderDataRoutes } from '../../fixtures/renderDataRoutes';

// The scroll reset must be mounted once inside the Router, so every route (public
// shell, console shell, the shared run page and the 404 page) starts at the top after
// a link click.

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

import { AppProviders } from '@/App';
import { appRoutes } from '@/appRoutes';

// The app's providers and routes under a data router, as App renders them in the browser.
const renderAppAt = (pathname: string): Promise<string> =>
  renderDataRoutes(appRoutes, pathname, (router) => <AppProviders>{router}</AppProviders>);

const countResets = (html: string) => html.split('data-scroll-reset=').length - 1;

describe('route scroll reset placement', () => {
  it('is mounted once, inside the Router, before the page on a Layout route', async () => {
    const html = await renderAppAt('/no-such-page');

    expect(countResets(html)).toBe(1);
    expect(html).toContain('data-scroll-reset="/no-such-page"');
    expect(html.indexOf('data-scroll-reset')).toBeLessThan(html.indexOf('Missing page'));
  });

  it('is mounted on the shared run page, which renders outside Layout', async () => {
    const html = await renderAppAt('/share/share-token');

    expect(countResets(html)).toBe(1);
    expect(html).toContain('data-scroll-reset="/share/share-token"');
  });
});
