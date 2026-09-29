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

const renderLayout = (location: string, child: string) => {
  navigation.reset(location);
  return renderToStaticMarkup(
    <Layout>
      <div>{child}</div>
    </Layout>,
  );
};

describe('Layout shell selection', () => {
  it('frames dashboard routes with the console sidebar and its navigation', () => {
    const html = renderLayout('/dashboard/templates', 'Console child');

    expect(html).toContain('data-app-shell="console"');
    expect(html).toContain('Console child');
    // The shadcn Sidebar block, with the console navigation in a Dashboard landmark.
    expect(html).toContain('data-slot="sidebar"');
    expect(html).toContain('<nav aria-label="Dashboard"');
    for (const [label, href] of [
      ['New Template', '/dashboard/templates/new/'],
      ['Templates', '/dashboard/templates/'],
      ['Runs', '/dashboard/runs/'],
      ['Template Library', '/templates/'],
      ['Categories', '/categories/'],
      ['Import Templates', '/dashboard/import-templates/'],
      ['Archive', '/dashboard/archive/'],
      ['Settings', '/dashboard/settings/'],
    ]) {
      expect(html, label).toMatch(new RegExp(`<a[^>]*href="${href}"[^>]*>(?:(?!</a>).)*<span>${label}</span>`));
    }
    // The current page is marked.
    expect(html).toMatch(/<a[^>]*href="\/dashboard\/templates\/"[^>]*aria-current="page"/);
    expect(html).toContain('Switch context');
    expect(html).not.toContain('>Profile<');
    expect(html).toContain('Switch to dark mode');
    expect(html).toContain('Light mode');
    // The top bar: the sidebar trigger and the site navigation (its menus and Pricing).
    expect(html).toContain('Toggle Sidebar');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Templates/);
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Features/);
    expect(html).toContain('href="/features/template-builder/"');
    expect(html).toContain('href="/pricing/"');
    expect(html).toContain('Build repeatable checklists');
  });

  it('hides New Template from members whose Organization role cannot create Templates', () => {
    workspaceState.canEditTemplates = false;
    try {
      const html = renderLayout('/dashboard/templates', 'Console child');

      expect(html).toContain('data-app-shell="console"');
      expect(html).not.toContain('New Template');
      expect(html).not.toContain('href="/dashboard/templates/new/"');
    } finally {
      workspaceState.canEditTemplates = true;
    }
  });

  it('marks Runs as the current section on a run page', () => {
    const html = renderLayout('/dashboard/runs/run-1/', 'Run child');

    expect(html).toMatch(/<a[^>]*href="\/dashboard\/runs\/"[^>]*aria-current="page"/);
  });

  it('uses the shared public shell for discovery routes', () => {
    const html = renderLayout('/templates', 'Discovery child');

    expect(html).toContain('h-14');
    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('Discovery child');
    expect(html).toContain('Switch to dark mode');
    expect(html).toContain('Build repeatable checklists');
    expect(html).not.toContain('data-slot="sidebar"');
  });

  it('uses the shared public shell for profile routes with the same header frame', () => {
    const html = renderLayout('/profile/designops', 'Profile child');

    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('Profile child');
    expect(html).toMatch(/<header[^>]*><div class="[^"]*max-w-6xl flex h-14 items-center[^"]*"/);
    expect(html).toContain('Build repeatable checklists');
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
      expect(html).toMatch(/<button[^>]*data-public-mobile-nav="trigger"[^>]*class="[^"]*md:hidden[^"]*"/);
      expect(html).toContain('Open menu');
    },
  );

  it('keeps the console shell to its own single menu button', () => {
    const html = renderAt('/dashboard/templates');

    expect(html).not.toContain('data-public-mobile-nav');
    // Phones open the sidebar itself as a sheet from this trigger.
    expect(html).toContain('Toggle Sidebar');
  });
});
