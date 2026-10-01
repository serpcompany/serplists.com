import React from 'react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChecklistRunPage from '@/views/ChecklistRun';
import type { ChecklistRun } from '@/types/checklist';

import { navigation, renderPageAt } from '../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

const mockUseRunExecutionModel = vi.fn();
vi.mock('@/features/run-execution/useRunExecutionModel', () => ({
  useRunExecutionModel: (...args: unknown[]) => mockUseRunExecutionModel(...args),
}));

vi.mock('@/hooks/usePageVisit', async () => (await import('../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'jane@test.com' } }),
}));

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({ getRun: vi.fn(), updateRun: vi.fn() }),
}));

vi.mock('@/contexts/WorkspaceContext', async () => {
  const { getResourcePermissions } = await import('@/lib/organizationPermissions');
  return {
    useWorkspace: () => ({
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, () => undefined),
      isRoleUnavailable: () => false,
      retryWorkspace: vi.fn(),
    }),
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const completeDialog = vi.hoisted(() => ({ props: null as null | { onComplete: () => void } }));
vi.mock('@/components/run-execution/RunCompleteDialog', () => ({
  RunCompleteDialog: (props: { onComplete: () => void }) => {
    completeDialog.props = props;
    return null;
  },
}));

const run = (status: ChecklistRun['status']): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Website Launch Checklist',
  status,
  progress: 100,
  sections: [
    {
      id: 'section-1',
      title: 'Pre-Launch',
      items: [
        { id: 'item-1', title: 'First task', isCompleted: true },
        { id: 'item-2', title: 'Last task', isCompleted: true },
      ],
    },
  ],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
  templateVersion: 1,
});

const renderRun = (options: { completeRun: () => Promise<unknown>; shared?: boolean; status?: ChecklistRun['status'] }) => {
  mockUseRunExecutionModel.mockReturnValue({
    counts: { progress: 100, subTasksCompleted: 0, subTasksTotal: 0, tasksCompleted: 2, tasksTotal: 2 },
    completeRun: options.completeRun,
    createShare: vi.fn(),
    hasUnsavedNotes: false,
    history: { data: null, isError: false, isLoading: false },
    isSharedRun: options.shared === true,
    loadError: null,
    loading: false,
    noteDrafts: {},
    notFound: false,
    progress: 100,
    restoreNoteDrafts: vi.fn(),
    run: run(options.status ?? 'in_progress'),
    saveItemNotes: vi.fn(),
    saveTitle: vi.fn(),
    selectedData: null,
    selectedItemId: 'item-2',
    setNoteDraft: vi.fn(),
    setSelectedItemId: vi.fn(),
    stopSharing: vi.fn(),
    toggleItem: vi.fn(),
    toggleSubItem: vi.fn(),
  });
  const path = options.shared ? '/share/abc123/' : '/dashboard/runs/run-1/';
  return renderPageAt(path, {
    '/dashboard/runs/[id]': <ChecklistRunPage />,
    '/share/[shareToken]': <ChecklistRunPage />,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  completeDialog.props = null;
});

describe('Completing a Run', () => {
  it('says "Run completed" and takes the owner or a member to My Runs', async () => {
    const completeRun = vi.fn().mockResolvedValue({ kind: 'ok', run: run('completed') });
    renderRun({ completeRun });

    completeDialog.props?.onComplete();

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Run completed'));
    expect(completeRun).toHaveBeenCalledTimes(1);
    expect(navigation.url()).toBe('/dashboard/runs/');
  });

  it('keeps a guest on the shared run', async () => {
    const completeRun = vi.fn().mockResolvedValue({ kind: 'ok', run: run('completed') });
    renderRun({ completeRun, shared: true });

    completeDialog.props?.onComplete();

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Run completed'));
    expect(navigation.url()).toBe('/share/abc123/');
    expect(navigation.router.push).not.toHaveBeenCalled();
  });

  it('keeps the Run and says why when the completion fails', async () => {
    const completeRun = vi.fn().mockResolvedValue({ kind: 'error', message: 'Finish every task before completing the run.' });
    renderRun({ completeRun });

    completeDialog.props?.onComplete();

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Finish every task before completing the run.'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(navigation.url()).toBe('/dashboard/runs/run-1/');
  });
});

describe('The shared run page', () => {
  it('says what anyone with the link can do, never that the Run is read-only', () => {
    const html = renderRun({ completeRun: vi.fn(), shared: true });

    expect(html).toContain('Anyone with this link can tick tasks, add notes and complete this Run.');
    expect(html).not.toMatch(/read-only/i);
    expect(html).toContain('In Progress');
  });

  it('shows a completed Run as completed', () => {
    const html = renderRun({ completeRun: vi.fn(), shared: true, status: 'completed' });

    expect(html).toMatch(/<span[^>]*data-slot="badge"[^>]*>Completed<\/span>/);
    expect(html).not.toContain('Complete run');
  });
});
