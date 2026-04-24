import React from 'react';
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

describe('Layout shell selection', () => {
  it('uses the exact dashboard sidebar framing from the v0 reference for dashboard routes', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/dashboard/templates']}>
        <Routes>
          <Route
            path="*"
            element={
              <Layout>
                <div>Console child</div>
              </Layout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('data-app-shell="console"');
    expect(html).toContain(
      'sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-border bg-card md:flex',
    );
    expect(html).toContain('New Template');
    expect(html).toContain('Switch to dark mode');
    expect(html).toContain('Import Templates');
    expect(html).toContain('Build repeatable checklists');
  });

  it('uses the shared public shell for discovery routes', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/templates']}>
        <Routes>
          <Route
            path="*"
            element={
              <Layout>
                <div>Discovery child</div>
              </Layout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('h-14');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('Discovery child');
    expect(html).toContain('Build repeatable checklists');
  });

  it('uses the shared public shell for profile routes with the same px-4 h-14 frame', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/profile/designops']}>
        <Routes>
          <Route
            path="*"
            element={
              <Layout>
                <div>Profile child</div>
              </Layout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('Profile child');
    expect(html).toContain(
      'mx-auto w-full px-4 max-w-[var(--layout-shell-max)] flex h-14 items-center justify-between gap-6',
    );
    expect(html).toContain('Build repeatable checklists');
  });
});
