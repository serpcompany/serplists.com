import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import SiteLayout from '@/app/(site)/layout';
import { Layout } from '@/components/Layout';

import { findElementOf } from '../../support/elementTree';

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

const appRouteFile = (route: string) => new URL(`../../../src/app/${route}/page.tsx`, import.meta.url);

describe('Layout route contracts', () => {
  it('renders non-discovery public routes with the shared h-14 public header frame', () => {
    const html = renderLayoutAt('/pricing', 'Nested public child');

    expect(html).toContain('Nested public child');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toMatch(
      /<header[^>]*><div class="[^"]*max-w-6xl flex h-14 items-center[^"]*" data-page-container="shell">/,
    );
  });

  it('keeps public content routes in the shared public Layout group', () => {
    const page = React.createElement('main', null, 'Public page');
    expect(findElementOf(SiteLayout({ children: page }), Layout)?.props.children).toBe(page);
    for (const route of [
      'templates',
      'categories',
      'categories/[categorySlug]',
      'profile/[username]/[templateSlug]',
      'profile/[username]',
    ]) {
      expect(existsSync(appRouteFile(`(site)/${route}`)), route).toBe(true);
    }
  });

  it('renders nested dashboard route content through the shared layout', () => {
    const html = renderLayoutAt('/dashboard/templates', 'Nested console child');

    expect(html).toContain('Nested console child');
    expect(html).toContain('data-app-shell="console"');
  });
});
