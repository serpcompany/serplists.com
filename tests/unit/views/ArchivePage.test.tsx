import { navigation } from '../../support/mockedNextNavigation';
import { appShell } from '../../support/appShellInPlace';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', async () => (await import('../../support/emptyArchiveApi')).emptyArchiveApi());

import AppLayout from '@/app/(app)/layout';
import ArchivePage from '@/app/(app)/dashboard/archive/page';
import RunsPage from '@/app/(app)/dashboard/runs/page';
import { Providers } from '@/app/providers';

import { inThePersonalWorkspace } from '../../fixtures/workspaces';

appShell.auth = {
  logout: vi.fn().mockResolvedValue({ ok: true }),
  user: { id: 'user-1', email: 'user@example.com', name: 'User One' },
};
appShell.templates = {
  templates: [],
  templatesLoading: false,
  runs: [],
  runsLoading: false,
  runsError: null,
  refetchRuns: vi.fn(),
  revalidateRun: vi.fn(),
  deleteRun: vi.fn(),
};
appShell.workspace = inThePersonalWorkspace({
  activeTeamId: undefined,
  getPermissions: () => ({ canRun: true, canEditTemplates: true, canManage: true }),
  workspaceScopeId: 'personal',
});

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
