import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Layout } from '@/components/Layout';

const logout = vi.fn().mockResolvedValue({ ok: true });
const auth = vi.hoisted(() => ({ user: null as { id: string; email: string; name: string; username?: string } | null }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: auth.user,
    logout,
  }),
}));

const workspaceState = vi.hoisted(() => ({ canEditTemplates: true }));

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { inThePersonalWorkspace } = await import('../../fixtures/workspaces');
  return {
    useWorkspace: () => inThePersonalWorkspace({ canEditTemplates: workspaceState.canEditTemplates }),
  };
});

const renderLayout = (location: string, child: string) => {
  navigation.reset(location);
  return renderToStaticMarkup(
    <Layout>
      <div>{child}</div>
    </Layout>,
  );
};

describe('Layout shell selection', () => {
  const renderMyTemplates = () => renderLayout('/dashboard/templates', 'Console child');

  it('frames dashboard routes with the console shell', () => {
    const html = renderMyTemplates();

    expect(html).toContain('data-app-shell="console"');
    expect(html).toContain('Console child');
  });

  it('puts the console navigation in the shadcn Sidebar block, in a Dashboard landmark', () => {
    const html = renderMyTemplates();

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
    expect(html).toContain('Switch context');
    expect(html).not.toContain('>Profile<');
    expect(html).toContain('Switch to dark mode');
    expect(html).toContain('Light mode');
  });

  it('marks the current page in the console navigation', () => {
    expect(renderMyTemplates()).toMatch(/<a[^>]*href="\/dashboard\/templates\/"[^>]*aria-current="page"/);
  });

  it('shows the sidebar trigger and the site navigation, its menus and Pricing, in the top bar', () => {
    const html = renderMyTemplates();

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

  it('uses the shell it is given, as the 404 page gives one, over the one its path would pick', () => {
    navigation.reset('/dashboard/definitely-missing/');
    const html = renderToStaticMarkup(
      <Layout shell="public">
        <div>Missing</div>
      </Layout>,
    );

    expect(html).toContain('data-app-shell="public"');
    expect(html).not.toContain('data-slot="sidebar"');
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

  it('frames a shared run with the header but no footer', () => {
    const html = renderLayout('/share/token-1/', 'Shared run');

    expect(html).toContain('data-app-shell="public"');
    expect(html).toContain('Shared run');
    expect(html).not.toContain('Build repeatable checklists');
  });

  it("names the signed-in user and their handle on the console sidebar's account menu", () => {
    auth.user = { id: 'user-1', email: 'alice@example.test', name: 'Alice', username: 'alice' };
    try {
      const html = renderLayout('/dashboard/templates', 'Console child');

      expect(html).toContain('>Alice<');
      expect(html).toContain('>@alice<');
    } finally {
      auth.user = null;
    }
  });

  it('offers a signed-in visitor the account menu instead of Log in', () => {
    auth.user = { id: 'user-1', email: 'alice@example.test', name: 'Alice' };
    try {
      const html = renderLayout('/templates', 'Discovery child');

      expect(html).toContain('aria-label="Account menu"');
      expect(html).not.toContain('>Log in<');
    } finally {
      auth.user = null;
    }
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

  it('keeps the console shell to its own single menu button, the trigger that opens the sidebar as a sheet on phones', () => {
    const html = renderAt('/dashboard/templates');

    expect(html).not.toContain('data-public-mobile-nav');
    expect(html).toContain('Toggle Sidebar');
  });
});
