import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Layout } from '@/components/Layout';
import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const logout = vi.fn().mockResolvedValue({ ok: true });

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: null,
    logout,
  }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeWorkspace: {
      id: 'personal',
      name: 'Personal',
      role: 'owner',
      type: 'personal',
    },
    isWorkspaceLoading: false,
    selectWorkspace: vi.fn(),
    workspaces: [
      {
        id: 'personal',
        name: 'Personal',
        role: 'owner',
        type: 'personal',
      },
    ],
  }),
}));

const renderLayoutAt = (pathname: string, child: string) => {
  navigation.reset(pathname);
  return renderToStaticMarkup(React.createElement(Layout, null, React.createElement('div', null, child)));
};

// The App Router route groups: src/app/(site) renders the public pages in the site Layout,
// src/app/(app) the signed-in pages behind RequireAuth.
const routeFile = (route: string) => new URL(`../../../src/app/${route}/page.tsx`, import.meta.url);
const layoutSource = (group: string) =>
  readFileSync(new URL(`../../../src/app/${group}/layout.tsx`, import.meta.url), 'utf8');

describe('Layout route contracts', () => {
  it('renders non-discovery public routes with the shared h-14 public header frame', () => {
    const html = renderLayoutAt('/pricing', 'Nested public child');

    expect(html).toContain('Nested public child');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain(
      'mx-auto w-full px-4 max-w-[var(--layout-shell-max)] flex h-14 items-center justify-between gap-6',
    );
  });

  it('keeps public content routes in the shared public Layout group', () => {
    expect(layoutSource('(site)')).toContain('<Layout>{children}</Layout>');
    for (const route of [
      'templates',
      'categories',
      'categories/[categorySlug]',
      'profile/[username]/[templateSlug]',
      'profile/[username]',
    ]) {
      expect(existsSync(routeFile(`(site)/${route}`)), route).toBe(true);
    }
  });

  it('renders nested dashboard route content through the shared layout', () => {
    const html = renderLayoutAt('/dashboard/templates', 'Nested console child');

    expect(html).toContain('Nested console child');
    expect(html).toContain('data-app-shell="console"');
  });
});
