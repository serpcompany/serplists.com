import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

let currentPath = '/';

const mockUseTemplateLibrary = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  return {
    ...actual,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => (
      <actual.MemoryRouter initialEntries={[currentPath]}>
        {children}
      </actual.MemoryRouter>
    ),
  };
});

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    logout: vi.fn(),
    user: null,
  }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  TemplatesProvider: ({ children }: { children: React.ReactNode }) => children,
  useTemplates: () => ({
    templates: [],
    templatesLoading: false,
  }),
}));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/DevLoginBar', () => ({
  DevLoginBar: () => null,
}));

vi.mock('@/components/ui/sonner', () => ({
  Toaster: () => null,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/RequireAuth', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/lib/analytics', () => ({
  analytics: {
    getEvents: vi.fn(() => []),
    setEnabled: vi.fn(),
    track: vi.fn(),
    trackError: vi.fn(),
    trackPageView: vi.fn(),
    trackTemplateComplete: vi.fn(),
    trackTemplateRun: vi.fn(),
    trackTemplateView: vi.fn(),
    trackUser: vi.fn(),
  },
}));

import App from '@/App';
import type { ChecklistTemplate } from '@/types/checklist';

const discoveryTemplate: ChecklistTemplate = {
  id: 'website-launch',
  slug: 'website-launch-checklist',
  title: 'Website Launch Checklist',
  description:
    'A comprehensive checklist for launching a new website. Covers pre-launch preparation, technical audits, and launch day tasks.',
  type: 'checklist',
  sections: [
    {
      id: 'section-1',
      title: 'Pre-Launch',
      items: [
        { id: 'item-1', title: 'Task 1' },
        { id: 'item-2', title: 'Task 2' },
        { id: 'item-3', title: 'Task 3' },
      ],
    },
    {
      id: 'section-2',
      title: 'Technical',
      items: [{ id: 'item-4', title: 'Task 4' }],
    },
  ],
  userId: 'user-1',
  createdAt: '2024-01-10T10:00:00Z',
  updatedAt: '2024-01-12T15:30:00Z',
  isPublic: true,
  categories: ['Web Development', 'Launch'],
  tags: ['website', 'launch', 'seo'],
  ownerProfile: { full_name: 'Design Ops', username: 'designops' },
};

const renderAppAt = (pathname: string) => {
  currentPath = pathname;
  mockUseTemplateLibrary.mockReturnValue({
    templates: [discoveryTemplate],
    loading: false,
    allCategories: ['Business & Operations', 'Launch', 'Web Development'],
  });

  return renderToStaticMarkup(<App />);
};

describe('App public route parity', () => {
  it('renders / inside the public marketing shell with the product workflow homepage', () => {
    const html = renderAppAt('/');

    expect(html).toContain('Build the checklist once. Run it every time.');
    expect(html).toContain('Template library');
    expect(html).toContain('Live run workspace');
    expect(html).toContain('Shareable proof');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('href="/templates"');
    expect(html).toContain('href="/features"');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('Checklist Product Prototype');
  });

  it('renders /docs inside the shared public shell instead of a standalone prototype header', () => {
    const html = renderAppAt('/docs');

    expect(html).toContain('Checklist &amp; Template Experience');
    expect(html).toContain('data-app-shell="public"');
    expect(html).not.toContain('Checklist Product Prototype');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /templates outside the generic public shell with one discovery header and detail-card href semantics', () => {
    const html = renderAppAt('/templates');

    expect(html).toContain('Discover Templates');
    expect(html).toContain('Browse by Category');
    expect(html).toContain('href="/dashboard/templates"');
    expect(html).toContain('href="/dashboard/templates/new"');
    expect(html).toContain('href="/profile/designops/website-launch-checklist"');
    expect(html).not.toContain('href="/run/website-launch"');
    expect(html).not.toContain('data-app-shell="public"');
    expect(html).not.toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /categories outside the generic public shell with one discovery header and no footer', () => {
    const html = renderAppAt('/categories');

    expect(html).toContain('Browse Categories');
    expect(html).toContain('Popular Categories');
    expect(html).toContain('All Categories');
    expect(html).not.toContain('data-app-shell="public"');
    expect(html).not.toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /categories/business outside the generic public shell with one discovery header and no footer', () => {
    const html = renderAppAt('/categories/business');

    expect(html).toContain('Business &amp; Operations');
    expect(html).toContain('All Categories');
    expect(html).toContain('Related Categories');
    expect(html).not.toContain('data-app-shell="public"');
    expect(html).not.toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('keeps private /run/:id in the authenticated dashboard layout and shared runs public', () => {
    const appSource = readFileSync(
      new URL('../../../src/App.tsx', import.meta.url),
      'utf8',
    );
    const publicLayoutBranch = appSource.match(
      /<Route element={<Layout \/>}>([\s\S]*?)<\/Route>/,
    );
    const privateLayoutBranch = appSource.match(
      /<Route\s+element=\{\s*<RequireAuth>[\s\S]*?<Layout \/>[\s\S]*?<\/RequireAuth>\s*\}\s*>([\s\S]*?)<\/Route>/,
    );

    expect(privateLayoutBranch?.[1]).toContain('path="/run/:id"');
    expect(privateLayoutBranch?.[1]).toContain('path="/dashboard/runs/:id"');
    expect(publicLayoutBranch?.[1]).not.toContain('path="/run/:id"');
    expect(appSource).toContain('path="/share/:shareToken"');
  });

  it('does not force dark mode globally because light mode is the default', () => {
    const appSource = readFileSync(
      new URL('../../../src/App.tsx', import.meta.url),
      'utf8',
    );

    expect(appSource).not.toContain("classList.add('dark')");
    expect(appSource).not.toContain('classList.add("dark")');
  });
});
