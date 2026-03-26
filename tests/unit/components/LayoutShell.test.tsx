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

describe('Layout console shell', () => {
  it('does not force the console shell into dark mode', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/console']}>
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

    expect(html).not.toContain('dark min-h-screen');
  });

  it('renders the stripped operational sidebar structure for console routes', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/console/templates']}>
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

    expect(html).toContain('Search templates');
    expect(html).not.toContain('Operate your checklist system');
  });

  it('keeps the public footer lean instead of repeating header links', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/pricing']}>
        <Routes>
          <Route
            path="*"
            element={
              <Layout>
                <div>Public child</div>
              </Layout>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(html).toContain('Checklists');
    expect(html).not.toContain('Explore');
    expect(html).not.toContain('Outside the app');
    expect(html).toContain('Company');
    expect(html).toContain('Support');
    expect(html).toContain('Network');
    expect(html).toContain('SERP DR');
  });
});
