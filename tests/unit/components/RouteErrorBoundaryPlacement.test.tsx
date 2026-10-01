import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import AppLayout from '@/app/(app)/layout';
import SiteLayout from '@/app/(site)/layout';
import NotFoundPage from '@/app/not-found';
import SharePage from '@/app/share/[shareToken]/page';

vi.mock('server-only', () => ({}));

vi.mock('@/components/RouteErrorBoundary', () => ({
  RouteErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <div data-route-boundary="true">{children}</div>
  ),
}));

vi.mock('@/views/ChecklistRun', () => ({ default: () => <p>Shared run page</p> }));
vi.mock('@/views/NotFound', () => ({ default: () => <p>Missing page</p> }));
vi.mock('@/components/seo/PageJsonLd', () => ({ PageJsonLd: () => null }));
vi.mock('@/server/pageMeta/sharedRunPage', () => ({ loadSharedRunPageSeo: async () => null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false, logout: vi.fn(), user: null }),
}));

vi.mock('@/components/RequireAuth', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({ templates: [], templatesLoading: false }),
}));

vi.mock('@/contexts/WorkspaceContext', () => {
  const personal = { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' };
  return {
    useWorkspace: () => ({
      activeWorkspace: personal,
      isWorkspaceLoading: false,
      selectWorkspace: vi.fn(),
      workspaces: [personal],
      workspaceStatus: 'ready',
    }),
  };
});

vi.mock('@/lib/analytics', () => ({
  analytics: new Proxy({}, { get: () => vi.fn(() => []) }),
}));

describe('route-level error boundary placement, below the site header so a page that crashes leaves the navigation usable', () => {
  it('wraps only the page inside the site layout, leaving the header outside', () => {
    navigation.reset('/pricing');
    const html = renderToStaticMarkup(
      <SiteLayout>
        <p>Pricing page</p>
      </SiteLayout>,
    );

    expect(html).toContain('<div data-route-boundary="true"><p>Pricing page</p></div>');
    expect(html.indexOf('<header')).toBeGreaterThan(-1);
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('data-route-boundary'));
  });

  it('wraps the signed-in pages inside the app layout', () => {
    navigation.reset('/dashboard/templates');
    const html = renderToStaticMarkup(
      <AppLayout>
        <p>My Templates</p>
      </AppLayout>,
    );

    expect(html).toContain('<div data-route-boundary="true"><p>My Templates</p></div>');
  });

  it('wraps the 404 page, which renders for unknown paths', () => {
    navigation.reset('/no-such-page');
    const html = renderToStaticMarkup(<NotFoundPage />);

    expect(html).toContain('<div data-route-boundary="true"><p>Missing page</p></div>');
    expect(html.indexOf('<header')).toBeLessThan(html.indexOf('data-route-boundary'));
  });

  it('wraps the shared run page, which renders outside Layout', () => {
    navigation.reset('/share/share-token', { params: { shareToken: 'share-token' } });
    const html = renderToStaticMarkup(
      <SharePage params={Promise.resolve({ shareToken: 'share-token' })} />,
    );

    expect(html).toContain('<p>Shared run page</p>');
    expect(html).toMatch(/<div data-route-boundary="true">.*<p>Shared run page<\/p><\/div>/);
    expect(html).not.toContain('<header');
  });
});
