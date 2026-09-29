import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);
vi.mock('server-only', () => ({}));
// Server-only parts of the dynamic pages: their JSON-LD and metadata lookups.
vi.mock('@/components/seo/PageJsonLd', () => ({ PageJsonLd: () => null }));
vi.mock('@/server/pageMeta/categoryPage', () => ({ loadCategoryPageSeo: async () => null }));

const mockUseTemplateLibrary = vi.fn();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: unknown[]) => mockUseTemplateLibrary(...args),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    logout: vi.fn().mockResolvedValue({ ok: true }),
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

vi.mock('@/contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
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

import SiteLayout from '@/app/(site)/layout';
import CategoryPage from '@/app/(site)/categories/[categorySlug]/page';
import CategoriesPage from '@/app/(site)/categories/page';
import HomePage from '@/app/(site)/page';
import TemplatesPage from '@/app/(site)/templates/page';
import NotFoundPage from '@/app/not-found';
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

// A public page as the App Router renders it: the site layout (src/app/(site)/layout.tsx)
// around the route's page.
const renderAppAt = (pathname: string, page: React.ReactNode, params?: Record<string, string>): string => {
  mockUseTemplateLibrary.mockReturnValue({
    templates: [discoveryTemplate],
    loading: false,
    allCategories: ['Business & Operations', 'Launch', 'Web Development'],
  });
  navigation.reset(pathname, params ? { params } : {});
  return renderToStaticMarkup(<SiteLayout>{page}</SiteLayout>);
};

const appFile = (route: string) => new URL(`../../../src/app/${route}`, import.meta.url);

describe('App public route parity', () => {
  it('renders / inside the public marketing shell with the product workflow homepage', async () => {
    const html = renderAppAt('/', <HomePage />);

    expect(html).toContain('Build the checklist once. Run it every time.');
    expect(html).toContain('Template library');
    expect(html).toContain('Live run tracking');
    expect(html).toContain('Shareable proof');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('href="/templates"');
    expect(html).toContain('href="/features"');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('Checklist Product Prototype');
  });

  it('treats the removed /docs prototype as a missing route', async () => {
    // No route file: Next.js renders src/app/not-found.tsx, which brings the site layout.
    expect(existsSync(appFile('(site)/docs'))).toBe(false);
    navigation.reset('/docs');
    const html = renderToStaticMarkup(<NotFoundPage />);

    expect(html).toContain('That page does not exist');
    expect(html).toContain('The route /docs could not be found.');
    expect(html).toContain('data-app-shell="public"');
    expect(html).not.toContain('Checklist &amp; Template Experience');
    expect(html).not.toContain('Prototype map');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /templates inside the shared public shell with detail-card href semantics', async () => {
    const html = renderAppAt('/templates', <TemplatesPage />);

    expect(html).toContain('Discover Templates');
    expect(html).toContain('Browse by Category');
    expect(html).toContain('href="/templates"');
    expect(html).toContain('href="/features"');
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/profile/designops/website-launch-checklist"');
    expect(html).not.toContain('href="/run/website-launch"');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /categories inside the shared public shell with one global header and footer', async () => {
    const html = renderAppAt('/categories', <CategoriesPage />);

    expect(html).toContain('Browse Categories');
    expect(html).toContain('Popular Categories');
    expect(html).toContain('All Categories');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /categories/business inside the shared public shell with one global header and footer', async () => {
    const html = renderAppAt(
      '/categories/business',
      <CategoryPage params={Promise.resolve({ categorySlug: 'business' })} />,
      { categorySlug: 'business' },
    );

    expect(html).toContain('Business &amp; Operations');
    expect(html).toContain('All Categories');
    expect(html).toContain('Related Categories');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('keeps private /run/:id in the authenticated dashboard layout and shared runs public', () => {
    // src/app/(app) renders its pages behind RequireAuth in the console Layout; src/app/share
    // sits outside both layouts.
    const appLayout = readFileSync(appFile('(app)/layout.tsx'), 'utf8');
    expect(appLayout).toMatch(/<RequireAuth>\s*<Layout>\{children\}<\/Layout>\s*<\/RequireAuth>/);

    expect(existsSync(appFile('(app)/run/[id]/page.tsx'))).toBe(true);
    expect(existsSync(appFile('(app)/dashboard/runs/[id]/page.tsx'))).toBe(true);
    expect(existsSync(appFile('(site)/run'))).toBe(false);
    expect(existsSync(appFile('share/[shareToken]/page.tsx'))).toBe(true);
  });

  it('does not force dark mode globally because light mode is the default', () => {
    for (const file of ['layout.tsx', 'providers.tsx']) {
      const source = readFileSync(appFile(file), 'utf8');
      expect(source, file).not.toContain("classList.add('dark')");
      expect(source, file).not.toContain('classList.add("dark")');
    }
  });
});
