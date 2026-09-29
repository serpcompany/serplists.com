import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Dashboard from '@/views/Dashboard';
import { createRunSharingActions, createRunsDashboardShareUrl } from '@/features/dashboard-runs/shareRun';
import { createApiError } from '@/lib/api-errors';
import { queryKeys } from '@/lib/queryCache';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

const mockUseAuth = vi.fn();
const mockUseTemplates = vi.fn();

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => mockUseTemplates(),
  useTemplateLists: () => mockUseTemplates(),
}));

const workspaceRoles = vi.hoisted(() => ({ roles: {} as Record<string, 'viewer' | 'editor' | 'admin'> }));

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  return {
    useWorkspace: () => ({
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, (id) => workspaceRoles.roles[id]),
    }),
  };
});

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('@/components/shared/LoadingSpinner', () => ({
  LoadingSpinner: ({ message }: { message: string }) => <div>{message}</div>,
}));

const runs: ChecklistRun[] = [
  {
    id: 'run-5',
    templateId: 'template-5',
    title: 'Team Offsite Planning',
    status: 'in_progress',
    progress: 20,
    sections: [
      {
        id: 'section-1',
        title: 'Planning',
        items: [
          { id: 'item-1', title: 'Book venue', isCompleted: true },
          { id: 'item-2', title: 'Confirm agenda' },
          { id: 'item-3', title: 'Send invites' },
        ],
      },
    ],
    startedAt: '2024-01-16T08:00:00Z',
    userId: 'user-1',
  },
  {
    id: 'run-1',
    templateId: 'template-1',
    title: 'Website Launch - Q1 Release',
    status: 'in_progress',
    progress: 35,
    sections: [
      {
        id: 'section-1',
        title: 'Pre-Launch',
        items: [
          { id: 'item-1', title: 'Review copy', isCompleted: true },
          { id: 'item-2', title: 'Check links', isCompleted: true },
          { id: 'item-3', title: 'QA staging' },
        ],
      },
      {
        id: 'section-2',
        title: 'Technical',
        items: [{ id: 'item-4', title: 'Deploy release' }],
      },
    ],
    startedAt: '2024-01-15T10:00:00Z',
    userId: 'user-1',
  },
  {
    id: 'run-3',
    templateId: 'template-3',
    title: 'Product Launch - Feature X',
    status: 'in_progress',
    progress: 60,
    sections: [
      {
        id: 'section-1',
        title: 'Pre-Launch',
        items: [
          { id: 'item-1', title: 'Finalize messaging', isCompleted: true },
          { id: 'item-2', title: 'Confirm launch plan', isCompleted: true },
          { id: 'item-3', title: 'Publish changelog' },
        ],
      },
    ],
    startedAt: '2024-01-12T11:00:00Z',
    userId: 'user-1',
  },
  {
    id: 'run-2',
    templateId: 'template-2',
    title: 'Onboarding - Sarah Chen',
    status: 'completed',
    progress: 100,
    sections: [
      {
        id: 'section-1',
        title: 'Day One',
        items: [{ id: 'item-1', title: 'Welcome and setup', isCompleted: true }],
      },
    ],
    startedAt: '2024-01-10T09:00:00Z',
    completedAt: '2024-01-14T16:00:00Z',
    userId: 'user-1',
    revision: 2,
    isStale: true,
  },
  {
    id: 'run-4',
    templateId: 'template-4',
    title: 'Code Review - Auth Refactor PR',
    status: 'completed',
    progress: 100,
    sections: [
      {
        id: 'section-1',
        title: 'Review',
        items: [{ id: 'item-1', title: 'Approve refactor', isCompleted: true }],
      },
    ],
    startedAt: '2024-01-08T14:00:00Z',
    completedAt: '2024-01-08T15:30:00Z',
    userId: 'user-1',
  },
];

const privateTemplate: ChecklistTemplate = {
  id: 'template-5',
  title: 'Team Offsite Template',
  description: '',
  type: 'checklist',
  sections: [],
  userId: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  isPublic: false,
  categories: [],
  tags: [],
  ownerProfile: { username: 'devteam' },
};

const publicCatalogTemplate: ChecklistTemplate = {
  ...privateTemplate,
  id: 'template-1',
  title: 'Website Launch Playbook',
  userId: 'someone-else',
  isPublic: true,
  ownerProfile: { username: 'launchcrew' },
};

// Mirrors the real context: `templates` is the public catalog only
// (mergePublicTemplateCollections drops private Templates), and private Personal or
// Organization Templates arrive only through `allTemplates`.
const templates: ChecklistTemplate[] = [publicCatalogTemplate];
const allTemplates: ChecklistTemplate[] = [privateTemplate];

const renderRunsPage = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <StaticRouter location="/dashboard/runs">
        <Routes>
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </StaticRouter>
    </QueryClientProvider>,
  );

describe('/dashboard/runs presentation', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockUseTemplates.mockReset();
  });

  it('renders the v0-style runs list instead of the old console dashboard body', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Dev User', email: 'dev@example.com' },
      logout: vi.fn().mockResolvedValue({ ok: true }),
    });
    mockUseTemplates.mockReturnValue({
      templates,
      allTemplates,
      templatesLoading: false,
      runs,
      runsLoading: false,
      updateRun: vi.fn(),
      revalidateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html).toContain('My Runs');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('3 in progress, 2 completed');
    expect(html).toContain('Search runs...');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('Team Offsite Planning');
    expect(html).toContain('From Team Offsite Template');
    expect(html).toContain('href="/dashboard/templates/template-5"');
    expect(html).toContain('Website Launch - Q1 Release');
    expect(html).toContain('Started Jan 16, 2024');
    expect(html).toContain('In Progress');
    expect(html).toContain('Completed');
    expect(html).toContain('Needs revalidation');
    expect(html).toContain('Revalidate');
    expect(html).toContain('href="/run/run-5"');
    expect(html).toContain('href="/run/run-2"');
    expect(html).toContain('data-run-actions="true"');
    expect(html).toContain('focus-within:opacity-100');
    expect(html).not.toContain('Track active checklist runs');
    expect(html).not.toContain('Active runs');
    expect(html).not.toContain('Completed runs');
    expect(html).not.toContain('Avg progress');
  });

  it('keeps the mocked catalog honest: `templates` never holds a private Template', () => {
    expect(templates.every((template) => template.isPublic)).toBe(true);
  });

  it('links runs to private workspace Templates and to catalog-only public Templates', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, logout: vi.fn() });
    const organizationTemplate: ChecklistTemplate = {
      ...privateTemplate,
      id: 'org-template',
      title: 'Org Checklist',
      teamId: 'team-1',
    };
    mockUseTemplates.mockReturnValue({
      templates,
      // In an Organization, allTemplates holds only that Organization's Templates.
      allTemplates: [organizationTemplate],
      templatesLoading: false,
      runs: [
        { ...runs[0], id: 'run-org', templateId: 'org-template', title: 'Acme' },
        { ...runs[1], id: 'run-public', templateId: 'template-1', title: 'Beta' },
        { ...runs[2], id: 'run-library', templateId: '', title: 'Library run' },
      ],
      runsLoading: false,
      updateRun: vi.fn(),
      revalidateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html).toContain('From Org Checklist');
    expect(html).toContain('href="/dashboard/templates/org-template"');
    expect(html).toContain('From Website Launch Playbook');
    expect(html).toContain('href="/dashboard/templates/template-1"');
    expect(html.match(/>From /g)).toHaveLength(2);
    expect(html).not.toContain('href="/dashboard/templates/"');
  });

  it('keeps the runs route structure visible while data is loading', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Dev User', email: 'dev@example.com' },
      logout: vi.fn().mockResolvedValue({ ok: true }),
    });
    mockUseTemplates.mockReturnValue({
      templates: [],
      templatesLoading: false,
      runs: [],
      runsLoading: true,
      updateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html).toContain('My Runs');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('Search runs...');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('No runs found');
  });

  it.each([
    ['a failed load', new Error('HTTP 500'), 'Retry'],
    ['an expired session', createApiError(401, { error: 'Unauthorized' }), 'Sign in'],
  ])('shows %s instead of an empty runs list', (_name, runsError, action) => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Dev User', email: 'dev@example.com' },
      logout: vi.fn().mockResolvedValue({ ok: true }),
    });
    mockUseTemplates.mockReturnValue({
      templates: [],
      templatesLoading: false,
      runs: [],
      runsLoading: false,
      runsError,
      refetchRuns: vi.fn(),
      updateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html).toContain('My Runs');
    expect(html).toContain('Couldn&#x27;t load your runs');
    expect(html).toContain(action);
    expect(html).not.toContain('No runs found');
  });

  it('does not offer the guaranteed-to-fail revalidation action for shared snapshots', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Dev User', email: 'dev@example.com' },
      logout: vi.fn().mockResolvedValue({ ok: true }),
    });
    mockUseTemplates.mockReturnValue({
      templates,
      templatesLoading: false,
      runs: [{ ...runs[3], isStale: true, isPublic: true }],
      runsLoading: false,
      updateRun: vi.fn(),
      revalidateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html).toContain('Shared snapshot is out of date');
    expect(html).not.toContain('>Revalidate<');
    // Stopping the share is the way out: the run becomes private and can be revalidated.
    expect(html).toContain('Stop sharing to update');
  });

  it('marks shared runs so owners can see which links are live', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', name: 'Dev User', email: 'dev@example.com' },
      logout: vi.fn(),
    });
    mockUseTemplates.mockReturnValue({
      templates,
      templatesLoading: false,
      runs: [{ ...runs[0], isPublic: true }, runs[1]],
      runsLoading: false,
      updateRun: vi.fn(),
      revalidateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html.match(/>Shared</g)).toHaveLength(1);
    expect(html).not.toContain('Stop sharing to update');
  });

  it('stops sharing through the API and refreshes the runs list and the run Changelog', async () => {
    const apiClient = {
      createChecklistRunShare: vi.fn().mockResolvedValue({ shareToken: 'share-token-1' }),
      revokeChecklistRunShare: vi.fn().mockResolvedValue({ id: 'run-5', isPublic: false }),
    };
    const queryClient = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };
    const actions = createRunSharingActions(queryClient, apiClient);

    await actions.stopSharingRun('run-5');
    expect(apiClient.revokeChecklistRunShare).toHaveBeenCalledWith('run-5');
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['runs'] });
    // The API wrote "Stopped sharing" to the run's Changelog, which stays fresh for 60s.
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.runHistory('run-5') });

    // Sharing refreshes the list through onShared (markRunShared) once the run is public.
    const onShared = vi.fn();
    await expect(
      createRunsDashboardShareUrl('run-5', 'https://serplists.com', apiClient, onShared),
    ).resolves.toBe('https://serplists.com/share/share-token-1');
    expect(onShared).toHaveBeenCalledWith('run-5');
  });

  it('does not refresh the runs list when stopping sharing fails', async () => {
    const apiClient = {
      createChecklistRunShare: vi.fn(),
      revokeChecklistRunShare: vi.fn().mockRejectedValue(new Error('Forbidden')),
    };
    const queryClient = { invalidateQueries: vi.fn() };

    await expect(createRunSharingActions(queryClient, apiClient).stopSharingRun('run-5')).rejects.toThrow('Forbidden');
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('hides run actions an Organization viewer cannot use', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, logout: vi.fn() });
    workspaceRoles.roles = { acme: 'viewer' };
    mockUseTemplates.mockReturnValue({
      templates,
      allTemplates,
      templatesLoading: false,
      runs: [{ ...runs[3], teamId: 'acme', isStale: true, isPublic: false }],
      runsLoading: false,
      updateRun: vi.fn(),
      revalidateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html).toContain('Onboarding - Sarah Chen');
    expect(html).not.toContain('>Revalidate<');
    expect(html).not.toContain('aria-label="Run options"');
  });

  it('keeps the run options for members who can share or delete', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' }, logout: vi.fn() });
    workspaceRoles.roles = { acme: 'editor' };
    mockUseTemplates.mockReturnValue({
      templates,
      allTemplates,
      templatesLoading: false,
      runs: [{ ...runs[3], teamId: 'acme', isStale: true, isPublic: false }],
      runsLoading: false,
      updateRun: vi.fn(),
      revalidateRun: vi.fn(),
      deleteRun: vi.fn(),
    });

    const html = renderRunsPage();

    expect(html).toContain('>Revalidate<');
    expect(html).toContain('aria-label="Run options"');
  });

  it('creates real shared run URLs instead of exposing protected run URLs', async () => {
    const apiClient = {
      createChecklistRunShare: vi.fn().mockResolvedValue({
        shareToken: 'share-token-1',
      }),
    };

    await expect(
      createRunsDashboardShareUrl(
        'run-5',
        'https://serplists.com',
        apiClient,
      ),
    ).resolves.toBe('https://serplists.com/share/share-token-1');

    expect(apiClient.createChecklistRunShare).toHaveBeenCalledWith('run-5');
  });
});
