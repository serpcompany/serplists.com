import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { navigation } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// Renders the real App Router pages in the signed-in layout, so this fails if no signed-in
// route mounts the archive (it once lived only in a Dashboard branch that no route reached).
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => ({
    logout: vi.fn().mockResolvedValue({ ok: true }),
    user: { id: 'user-1', email: 'user@example.com', name: 'User One' },
  }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  TemplatesProvider: ({ children }: { children: React.ReactNode }) => children,
  useTemplateLists: () => ({
    templates: [],
    templatesLoading: false,
    runs: [],
    runsLoading: false,
    runsError: null,
    refetchRuns: vi.fn(),
    revalidateRun: vi.fn(),
    deleteRun: vi.fn(),
  }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspace: () => ({
    activeTeamId: undefined,
    activeWorkspace: { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' },
    getPermissions: () => ({ canRun: true, canEditTemplates: true, canManage: true }),
    isWorkspaceLoading: false,
    selectWorkspace: vi.fn(),
    workspaceScopeId: 'personal',
    workspaces: [{ id: 'personal', name: 'Personal', role: 'owner', type: 'personal' }],
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getArchivedTemplates: vi.fn().mockResolvedValue([]),
    getArchivedChecklists: vi.fn().mockResolvedValue([]),
    restoreChecklist: vi.fn(),
    restoreTemplate: vi.fn(),
  },
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

import AppLayout from '@/app/(app)/layout';
import ArchivePage from '@/app/(app)/dashboard/archive/page';
import RunsPage from '@/app/(app)/dashboard/runs/page';
import { Providers } from '@/app/providers';

// A signed-in page as the root layout renders it: the app's providers, then the signed-in
// layout (src/app/(app)/layout.tsx) around the route's page.
const renderAppAt = (pathname: string, page: React.ReactNode): string => {
  navigation.reset(pathname);
  return renderToStaticMarkup(
    <Providers>
      <AppLayout>{page}</AppLayout>
    </Providers>,
  );
};

// Assert on booleans: a failed toContain would print the whole page.
const has = (html: string, text: string) => html.includes(text);

describe('archive route', () => {
  it('mounts the archive at /dashboard/archive in the signed-in console', async () => {
    const html = renderAppAt('/dashboard/archive/', <ArchivePage />);

    expect(has(html, 'data-archive-recovery-section="true"')).toBe(true);
    expect(has(html, 'data-app-shell="console"')).toBe(true);
    expect(has(html, 'Archived templates')).toBe(true);
    expect(has(html, 'Archived runs')).toBe(true);
    expect(has(html, 'That page does not exist')).toBe(false);
  });

  it('links the archive from the console navigation and keeps /dashboard/runs on the runs list', async () => {
    const html = renderAppAt('/dashboard/runs/', <RunsPage />);

    expect(has(html, 'href="/dashboard/archive/"')).toBe(true);
    expect(has(html, 'My Runs')).toBe(true);
    expect(has(html, 'data-archive-recovery-section')).toBe(false);
  });
});
