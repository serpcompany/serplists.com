import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Layout } from '@/components/Layout';

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

describe('Layout route contracts', () => {
  it('renders non-discovery public routes with the shared h-14 public header frame', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        StaticRouter,
        { location: '/pricing' },
        React.createElement(
          Routes,
          null,
          React.createElement(
            Route,
            { element: React.createElement(Layout) },
            React.createElement(Route, {
              path: '/pricing',
              element: React.createElement('div', null, 'Nested public child'),
            }),
          ),
        ),
      ),
    );

    expect(html).toContain('Nested public child');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain(
      'mx-auto w-full px-4 max-w-[var(--layout-shell-max)] flex h-14 items-center justify-between gap-6',
    );
  });

  it('keeps public content routes in the shared public Layout branch', () => {
    const appSource = readFileSync(
      new URL('../../../src/appRoutes.tsx', import.meta.url),
      'utf8',
    );
    const publicLayoutBranch = appSource.match(
      /<Route element={<Layout \/>}>([\s\S]*?)<\/Route>/,
    );

    expect(publicLayoutBranch?.[1]).toContain(
      'path={buildPublicTemplatesPath()}',
    );
    expect(publicLayoutBranch?.[1]).toContain('path="/categories"');
    expect(publicLayoutBranch?.[1]).toContain(
      'path="/categories/:categorySlug"',
    );
    expect(publicLayoutBranch?.[1]).toContain(
      'path="/profile/:username/:templateSlug"',
    );
    expect(publicLayoutBranch?.[1]).toContain('path="/profile/:username"');
  });

  it('renders nested dashboard route content through the shared layout outlet', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        StaticRouter,
        { location: '/dashboard/templates' },
        React.createElement(
          Routes,
          null,
          React.createElement(
            Route,
            { element: React.createElement(Layout) },
            React.createElement(Route, {
              path: '/dashboard/templates',
              element: React.createElement('div', null, 'Nested console child'),
            }),
          ),
        ),
      ),
    );

    expect(html).toContain('Nested console child');
    expect(html).toContain('data-app-shell="console"');
  });
});
