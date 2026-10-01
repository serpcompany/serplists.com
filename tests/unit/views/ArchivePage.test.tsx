import '../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { navigation } from '../../support/nextNavigation';

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

vi.mock('@/components/ui/tooltip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/tooltip')>()),
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

const renderInTheSignedInLayoutAt = (pathname: string, page: React.ReactNode): string => {
  navigation.reset(pathname);
  return renderToStaticMarkup(
    <Providers>
      <AppLayout>{page}</AppLayout>
    </Providers>,
  );
};

const pageIncludes = (html: string, text: string) => html.includes(text);

describe('archive route', () => {
  it('mounts the archive at /dashboard/archive in the signed-in console', async () => {
    const html = renderInTheSignedInLayoutAt('/dashboard/archive/', <ArchivePage />);

    expect(pageIncludes(html, 'data-archive-recovery-section="true"')).toBe(true);
    expect(pageIncludes(html, 'data-app-shell="console"')).toBe(true);
    expect(pageIncludes(html, 'Archived templates')).toBe(true);
    expect(pageIncludes(html, 'Archived runs')).toBe(true);
    expect(pageIncludes(html, 'That page does not exist')).toBe(false);
  });

  it('links the archive from the console navigation and keeps /dashboard/runs on the runs list', async () => {
    const html = renderInTheSignedInLayoutAt('/dashboard/runs/', <RunsPage />);

    expect(pageIncludes(html, 'href="/dashboard/archive/"')).toBe(true);
    expect(pageIncludes(html, 'My Runs')).toBe(true);
    expect(pageIncludes(html, 'data-archive-recovery-section')).toBe(false);
  });
});
