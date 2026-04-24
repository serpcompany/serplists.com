import React from 'react';
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
  it('renders / as a standalone v0 page with both Design Docs actions pointing to /docs', () => {
    const html = renderAppAt('/');

    expect(html).toContain('Checklist Product Prototype');
    expect(html).toContain('href="/docs"');
    expect((html.match(/href="\/docs"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('data-app-shell="public"');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /templates outside the generic public shell with one discovery header and v0 card href semantics', () => {
    const html = renderAppAt('/templates');

    expect(html).toContain('Discover Templates');
    expect(html).toContain('Browse by Category');
    expect(html).toContain('href="/dashboard/templates"');
    expect(html).toContain('href="/dashboard/templates/new"');
    expect(html).toContain('href="/profile/designops/website-launch-checklist"');
    expect(html).toContain('href="/run/website-launch"');
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
});
