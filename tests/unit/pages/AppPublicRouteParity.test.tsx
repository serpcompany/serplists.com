import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { renderDataRoutes } from '../../fixtures/renderDataRoutes';

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

vi.mock('@/components/shared/SEOHead', () => ({
  SEOHead: ({ robots, url }: { robots?: string; url?: string }) => (
    <>
      <meta content={robots ?? 'index, follow'} name="robots" />
      <link href={url} rel="canonical" />
    </>
  ),
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

import { AppProviders } from '@/App';
import { appRoutes } from '@/appRoutes';
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

// The app's providers and routes under a data router, as App renders them in the browser.
const renderAppAt = (pathname: string): Promise<string> => {
  mockUseTemplateLibrary.mockReturnValue({
    templates: [discoveryTemplate],
    loading: false,
    allCategories: ['Business & Operations', 'Launch', 'Web Development'],
  });

  return renderDataRoutes(appRoutes, pathname, (router) => (
    <AppProviders>{router}</AppProviders>
  ));
};

describe('App public route parity', () => {
  it('renders / inside the public marketing shell with the product workflow homepage', async () => {
    const html = await renderAppAt('/');

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
    const html = await renderAppAt('/docs');

    expect(html).toContain('That page does not exist');
    expect(html).toContain('The route /docs could not be found.');
    expect(html).toContain('data-app-shell="public"');
    expect(html).not.toContain('Checklist &amp; Template Experience');
    expect(html).not.toContain('Prototype map');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /templates inside the shared public shell with detail-card href semantics', async () => {
    const html = await renderAppAt('/templates');

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
    const html = await renderAppAt('/categories');

    expect(html).toContain('Browse Categories');
    expect(html).toContain('Popular Categories');
    expect(html).toContain('All Categories');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('renders /categories/business inside the shared public shell with one global header and footer', async () => {
    const html = await renderAppAt('/categories/business');

    expect(html).toContain('Business &amp; Operations');
    expect(html).toContain('All Categories');
    expect(html).toContain('Related Categories');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('<footer');
    expect((html.match(/<header/g) ?? []).length).toBe(1);
  });

  it('keeps private /run/:id in the authenticated dashboard layout and shared runs public', () => {
    const appSource = readFileSync(
      new URL('../../../src/appRoutes.tsx', import.meta.url),
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
