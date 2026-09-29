import React from 'react';
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

const workspaceState = vi.hoisted(() => ({ canEditTemplates: true }));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    canEditTemplates: workspaceState.canEditTemplates,
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

describe('Layout shell selection', () => {
  it('uses the exact dashboard sidebar framing from the v0 reference for dashboard routes', () => {
    navigation.reset('/dashboard/templates');
    const html = renderToStaticMarkup(
      <Layout>
        <div>Console child</div>
      </Layout>,
    );

    expect(html).toContain('data-app-shell="console"');
    expect(html).toContain(
      'sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-border bg-card md:flex',
    );
    expect(html).toContain('New Template');
    expect(html).toContain('min-h-11 w-full justify-start');
    expect(html).toContain('Settings');
    expect(html).not.toContain('>Profile<');
    expect(html).toContain('Switch to dark mode');
    expect(html).toContain('Import Templates');
    expect(html).toContain('Build repeatable checklists');
  });

  it('hides New Template from members whose Organization role cannot create Templates', () => {
    workspaceState.canEditTemplates = false;
    try {
      navigation.reset('/dashboard/templates');
      const html = renderToStaticMarkup(
        <Layout>
        <div>Console child</div>
      </Layout>,
      );

      expect(html).toContain('data-app-shell="console"');
      expect(html).not.toContain('New Template');
      expect(html).not.toContain('href="/dashboard/templates/new/"');
    } finally {
      workspaceState.canEditTemplates = true;
    }
  });

  it('uses the shared public shell for discovery routes', () => {
    navigation.reset('/templates');
    const html = renderToStaticMarkup(
      <Layout>
        <div>Discovery child</div>
      </Layout>,
    );

    expect(html).toContain('h-14');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('Discovery child');
    expect(html).toContain('Switch to dark mode');
    expect(html).toContain('Build repeatable checklists');
  });

  it('uses the shared public shell for profile routes with the same px-4 h-14 frame', () => {
    navigation.reset('/profile/designops');
    const html = renderToStaticMarkup(
      <Layout>
        <div>Profile child</div>
      </Layout>,
    );

    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('Profile child');
    expect(html).toContain(
      'mx-auto w-full px-4 max-w-[var(--layout-shell-max)] flex h-14 items-center justify-between gap-6',
    );
    expect(html).toContain('Build repeatable checklists');
  });

  it('makes theme switching available from the mobile console menu', () => {
    navigation.reset('/dashboard/templates');
    const html = renderToStaticMarkup(
      <Layout>
        <div>Console child</div>
      </Layout>,
    );

    expect(html).toContain('Toggle menu');
    expect(html).toContain('Light mode');
  });
});

describe('public shell on phones', () => {
  const renderAt = (location: string) => {
    navigation.reset(location);
    return renderToStaticMarkup(
      <Layout>
        <div>Child</div>
      </Layout>,
    );
  };

  it.each(['/', '/templates', '/categories/business', '/features', '/pricing', '/profile/designops/launch', '/login'])(
    'offers a menu button below the md breakpoint on %s',
    (location) => {
      const html = renderAt(location);

      expect(html).toContain('data-app-shell="public"');
      expect(html).toMatch(/<button[^>]*data-public-mobile-nav="trigger"[^>]*>/);
      expect(html).toMatch(/<button[^>]*class="[^"]*md:hidden[^"]*"[^>]*data-public-mobile-nav="trigger"/);
      expect(html).toContain('Open menu');
    },
  );

  it('keeps the console shell to its own single menu button', () => {
    const html = renderAt('/dashboard/templates');

    expect(html).not.toContain('data-public-mobile-nav');
    expect(html).toContain('Toggle menu');
  });
});
