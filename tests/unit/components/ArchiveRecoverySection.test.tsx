import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArchiveRecoverySection } from '@/components/dashboard/ArchiveRecoverySection';
import { useArchiveRecovery } from '@/features/archive/useArchiveRecovery';
import { api } from '@/lib/api';
import { getResourcePermissions, type OrganizationRole } from '@/lib/organizationPermissions';
import { queryKeys } from '@/lib/queryKeys';

const workspace = vi.hoisted(() => ({
  activeTeamId: undefined as string | undefined,
  loading: false,
  role: undefined as string | undefined,
  scope: 'personal',
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user@example.com' },
  }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: workspace.activeTeamId,
    getPermissions: (teamId?: string) =>
      getResourcePermissions(teamId, () => workspace.role as OrganizationRole | undefined),
    isWorkspaceLoading: workspace.loading,
    workspaceScopeId: workspace.scope,
  }),
}));

afterEach(() => {
  workspace.activeTeamId = undefined;
  workspace.loading = false;
  workspace.role = undefined;
  workspace.scope = 'personal';
});

vi.mock('@/lib/api', () => ({
  api: {
    getArchivedTemplates: vi.fn().mockResolvedValue([]),
    getArchivedChecklists: vi.fn().mockResolvedValue([]),
    restoreChecklist: vi.fn(),
    restoreTemplate: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('ArchiveRecoverySection', () => {
  it('renders archived templates and runs from the active workspace cache', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.archivedTemplates('user-1', 'personal'), [
      {
        id: 'template-1',
        kind: 'template',
        title: 'Archived Launch Template',
        archivedAt: '2026-07-03T12:00:00.000Z',
      },
    ]);
    queryClient.setQueryData(queryKeys.archivedRuns('user-1', 'personal'), [
      {
        id: 'run-1',
        kind: 'run',
        title: 'Archived Launch Run',
        archivedAt: '2026-07-03T12:30:00.000Z',
      },
    ]);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ArchiveRecoverySection />
      </QueryClientProvider>,
    );

    expect(html).toContain('data-archive-recovery-section="true"');
    expect(html).toContain('Archive');
    expect(html).toContain('2 archived');
    expect(html).toContain('Archived Launch Template');
    expect(html).toContain('Archived Launch Run');
    expect(html).toContain('Archived Jul 3, 2026');
    expect(html).toContain('Restore');
  });
});

// The API restores a Template for editors and above, and a Run for admins and above
// (canEditTemplate, canRestoreRun). Offering Restore to other roles only led to "Forbidden".
describe('ArchiveRecoverySection restore by role', () => {
  const renderArchive = () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.archivedTemplates('user-1', workspace.scope), [
      { id: 'template-1', kind: 'template', title: 'Archived Launch Template', archivedAt: '2026-07-03T12:00:00.000Z' },
    ]);
    queryClient.setQueryData(queryKeys.archivedRuns('user-1', workspace.scope), [
      { id: 'run-1', kind: 'run', title: 'Archived Launch Run', archivedAt: '2026-07-03T12:30:00.000Z' },
    ]);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ArchiveRecoverySection />
      </QueryClientProvider>,
    );
    const [templatesList, runsList] = html.split('Archived runs</h2>');
    const restoreButtons = (list: string) => (list.match(/>Restore<\/button>/g) ?? []).length;
    return {
      html,
      runs: restoreButtons(runsList),
      templates: restoreButtons(templatesList),
    };
  };

  it('offers Restore on both lists in Personal', () => {
    const shown = renderArchive();
    expect(shown.templates).toBe(1);
    expect(shown.runs).toBe(1);
  });

  it.each([
    ['owner', 1, 1],
    ['admin', 1, 1],
    ['editor', 1, 0],
    ['runner', 0, 0],
    ['viewer', 0, 0],
    [undefined, 0, 0],
  ])('offers an Organization %s Restore only where the API allows it', (role, templates, runs) => {
    workspace.activeTeamId = 'team-1';
    workspace.role = role;
    workspace.scope = 'team-1';

    const shown = renderArchive();

    // The archived items stay listed: every member may see them.
    expect(shown.html).toContain('Archived Launch Template');
    expect(shown.html).toContain('Archived Launch Run');
    expect(shown.templates).toBe(templates);
    expect(shown.runs).toBe(runs);
  });
});

describe('useArchiveRecovery restore', () => {
  it('sends no request for a kind the role cannot restore, as from a stale render', async () => {
    workspace.activeTeamId = 'team-1';
    workspace.role = 'editor';
    workspace.scope = 'team-1';
    let recovery: ReturnType<typeof useArchiveRecovery> | undefined;
    const Probe = () => {
      recovery = useArchiveRecovery();
      return null;
    };
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Probe />
      </QueryClientProvider>,
    );

    expect(recovery?.canRestoreTemplates).toBe(true);
    expect(recovery?.canRestoreRuns).toBe(false);
    await recovery?.restore({ id: 'run-1', kind: 'run', title: 'Archived Launch Run', archivedAt: '' });

    expect(api.restoreChecklist).not.toHaveBeenCalled();
  });
});

// An archive list must never read as empty before it has loaded: a user who just deleted a
// Template or Run would think it was gone for good.
describe('ArchiveRecoverySection before its lists load', () => {
  const render = (queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) =>
    renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ArchiveRecoverySection />
      </QueryClientProvider>,
    );
  const expectLoading = (html: string) => {
    expect(html).toContain('Loading archived templates...');
    expect(html).toContain('Loading archived runs...');
    expect(html).toContain('>Loading<');
    expect(html).not.toContain('No archived templates');
    expect(html).not.toContain('No archived runs');
    expect(html).not.toContain('0 archived');
    expect(html).not.toMatch(/>0<\/span>/);
  };

  it('shows loading while the Organizations load (the lists wait, disabled)', () => {
    workspace.activeTeamId = 'team-1';
    workspace.loading = true;
    workspace.scope = 'team-1';

    expectLoading(render());
  });

  it('shows loading during the first request', () => {
    expectLoading(render());
  });

  it('shows the empty labels and the count once both lists loaded empty', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.archivedTemplates('user-1', 'personal'), []);
    queryClient.setQueryData(queryKeys.archivedRuns('user-1', 'personal'), []);

    const html = render(queryClient);

    expect(html).toContain('No archived templates');
    expect(html).toContain('No archived runs');
    expect(html).toContain('0 archived');
    expect(html).not.toContain('Loading');
  });

  it('shows the failed list with Retry and claims no total', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(queryKeys.archivedTemplates('user-1', 'personal'), []);
    const runsKey = queryKeys.archivedRuns('user-1', 'personal');
    // Keep the failure on screen: by default a mount would retry it (and show loading).
    queryClient.setQueryDefaults(runsKey, { retryOnMount: false });
    await queryClient.prefetchQuery({ queryKey: runsKey, queryFn: () => Promise.reject(new Error('Server down')) });

    const html = render(queryClient);

    expect(html).toContain('No archived templates');
    expect(html).toContain("Couldn&#x27;t load your archived runs");
    expect(html).toContain('Retry');
    expect(html).not.toContain('No archived runs');
    expect(html).not.toContain('archived</span>');
    expect(html).not.toContain('>Loading<');
  });
});
