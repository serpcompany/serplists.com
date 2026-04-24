import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { Layout } from '@/components/Layout';

const logout = vi.fn();

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: null,
    logout,
  }),
}));

describe('Layout route contracts', () => {
  it('renders non-discovery public routes with the shared h-14 max-w-6xl public header frame', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/pricing'] },
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
      'mx-auto w-full px-4 max-w-6xl flex h-14 items-center justify-between gap-6',
    );
  });

  it('keeps categories and profile routes inside the shared public Layout branch in App.tsx', () => {
    const appSource = readFileSync(
      new URL('../../../src/App.tsx', import.meta.url),
      'utf8',
    );
    const publicLayoutBranch = appSource.match(
      /<Route element={<Layout \/>}>([\s\S]*?)<\/Route>/,
    );

    expect(publicLayoutBranch?.[1]).toContain('path="/categories"');
    expect(publicLayoutBranch?.[1]).toContain('path="/categories/:categorySlug"');
    expect(publicLayoutBranch?.[1]).toContain(
      'path="/profile/:username/:templateSlug"',
    );
    expect(publicLayoutBranch?.[1]).toContain('path="/profile/:username"');
  });

  it('renders nested dashboard route content through the shared layout outlet', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard/templates'] },
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
