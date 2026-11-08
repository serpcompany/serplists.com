import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApiError } from '@/lib/api-errors';
import { getResourcePermissions, type OrganizationRole } from '@/lib/organizationPermissions';

import { deferred } from '../../../support/deferred';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';

const workspace = vi.hoisted(() => ({ activeTeamId: undefined as string | undefined, role: undefined as OrganizationRole | undefined }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
const apiMocks = vi.hoisted(() => ({
  getArchivedChecklists: vi.fn(),
  getArchivedTemplates: vi.fn(),
  restoreChecklist: vi.fn(),
  restoreTemplate: vi.fn(),
}));
const signedIn = vi.hoisted(() => ({ user: { id: 'user-1' } }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => signedIn }));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => {
    const roleIn = () => workspace.role;
    return {
      workspaceScopeId: workspace.activeTeamId ?? 'personal',
      isWorkspaceLoading: false,
      activeTeamId: workspace.activeTeamId,
      getPermissions: (teamId?: string) => getResourcePermissions(teamId, roleIn),
    };
  },
}));
vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('sonner', () => ({ toast }));

import { useArchiveRecovery } from '@/features/archive/useArchiveRecovery';

const archivedTemplate = { id: 'template-1', title: 'Launch', deleted_at: '2026-07-03T12:00:00.000Z' };
const archivedRun = { id: 'run-1', title: 'Launch run', deleted_at: '2026-07-04T12:00:00.000Z' };

const unmounts: Array<() => void> = [];
beforeEach(() => {
  workspace.activeTeamId = undefined;
  workspace.role = undefined;
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  Object.values(toast).forEach((mock) => mock.mockReset());
  apiMocks.getArchivedTemplates.mockResolvedValue([archivedTemplate]);
  apiMocks.getArchivedChecklists.mockResolvedValue([archivedRun]);
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function openTheArchive() {
  const archive = await mountQueryHook(() => useArchiveRecovery());
  unmounts.push(archive.unmount);
  await act(settle);
  return archive.current;
}

async function restoreTheArchivedRun(archive: Awaited<ReturnType<typeof openTheArchive>>) {
  const [run] = archive().archivedRuns;
  if (!run) throw new Error('No archived run is listed');
  await act(async () => {
    await archive().restore(run);
  });
}

describe('the archive of deleted templates and runs', () => {
  it("lists the Organization's deleted templates and runs", async () => {
    workspace.activeTeamId = 'team-1';
    workspace.role = 'admin';
    const archive = await openTheArchive();

    expect(apiMocks.getArchivedTemplates).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(apiMocks.getArchivedChecklists).toHaveBeenCalledWith({ teamId: 'team-1' });
    expect(archive().archivedTemplates.map(({ title }) => title)).toEqual(['Launch']);
    expect(archive().archivedRuns.map(({ title }) => title)).toEqual(['Launch run']);
    expect(archive().templatesState).toBe('loaded');
  });

  it('restores a template once for a double click, marks it as restoring meanwhile, and says so', async () => {
    const restored = deferred<{ success: true }>();
    apiMocks.restoreTemplate.mockReturnValue(restored.promise);
    const archive = await openTheArchive();
    const [template] = archive().archivedTemplates;
    if (!template) throw new Error('No archived template is listed');

    let restoring: Promise<void> | undefined;
    await act(async () => {
      restoring = archive().restore(template);
      void archive().restore(template);
      await settle();
    });
    expect(archive().restoringIds.has('template-1')).toBe(true);

    apiMocks.getArchivedTemplates.mockResolvedValue([]);
    restored.resolve({ success: true });
    await act(async () => {
      await restoring;
      await settle();
    });

    expect(apiMocks.restoreTemplate).toHaveBeenCalledTimes(1);
    expect(apiMocks.restoreTemplate).toHaveBeenCalledWith('template-1');
    expect(toast.success).toHaveBeenCalledWith('Template restored');
    expect(archive().restoringIds.size).toBe(0);
    expect(archive().archivedTemplates).toEqual([]);
  });

  it('restores a run and says so', async () => {
    apiMocks.restoreChecklist.mockResolvedValue({ success: true });
    const archive = await openTheArchive();

    await restoreTheArchivedRun(archive);

    expect(apiMocks.restoreChecklist).toHaveBeenCalledWith('run-1');
    expect(toast.success).toHaveBeenCalledWith('Run restored');
  });

  it('explains a run that was already restored elsewhere', async () => {
    apiMocks.restoreChecklist.mockRejectedValue(createApiError(409, { error: 'Not archived', code: 'not_archived' }));
    const archive = await openTheArchive();

    await restoreTheArchivedRun(archive);

    expect(toast.error).toHaveBeenCalledWith('This run was already restored. The list was refreshed.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(archive().restoringIds.size).toBe(0);
  });

  it('loads both lists again when asked to retry', async () => {
    const archive = await openTheArchive();
    apiMocks.getArchivedTemplates.mockResolvedValue([{ ...archivedTemplate, id: 'template-2', title: 'Retro' }]);
    apiMocks.getArchivedChecklists.mockResolvedValue([]);

    await act(async () => {
      archive().refetchTemplates();
      archive().refetchRuns();
      await settle();
    });
    await act(settle);

    expect(archive().archivedTemplates.map((template) => template.title)).toEqual(['Retro']);
    expect(archive().archivedRuns).toEqual([]);
  });
});
