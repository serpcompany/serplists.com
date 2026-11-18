import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

import { PRIVATE_LAUNCH_TEMPLATE } from '../../../fixtures/dashboardTemplate';
import { deferred } from '../../../support/deferred';
import { renderSettled } from '../../../support/renderInTheDom';

const signedIn = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }));
const lists = vi.hoisted(() => ({
  allTemplates: [] as ChecklistTemplate[],
  createRun: vi.fn<(params: { templateId: string; runName?: string | undefined }) => Promise<ChecklistRun | null>>(),
  deleteTemplate: vi.fn<(id: string) => Promise<void>>(),
  refetchTemplates: vi.fn(async () => []),
  templatesError: null,
  templatesLoading: false,
}));
const router = vi.hoisted(() => ({ push: vi.fn<(href: string) => boolean>() }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => signedIn }));
vi.mock('@/contexts/TemplatesContext', () => ({ useTemplateLists: () => lists }));
const inAnOrganization = vi.hoisted(() => ({ role: undefined as 'viewer' | 'editor' | undefined }));
vi.mock('@/contexts/WorkspaceContext', async () => {
  const { inThePersonalWorkspace } = await import('../../../fixtures/workspaces');
  const { organizationConsole } = await import('@/lib/consoleRoutes');
  return {
    useWorkspace: () =>
      inAnOrganization.role
        ? {
            activeTeamId: 'team-1',
            activeWorkspace: { id: 'team-1', name: 'Acme', role: inAnOrganization.role, type: 'team' },
            consoleContext: organizationConsole('team-1'),
            isTeamWorkspace: true,
          }
        : inThePersonalWorkspace({ activeTeamId: undefined, isTeamWorkspace: false }),
  };
});
vi.mock('@/lib/navigation/useAppRouter', () => ({ useAppRouter: () => router }));
vi.mock('@/hooks/usePageVisit', async () => (await import('../../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);

import { useDashboardTemplatesModel } from '@/features/dashboard-templates/useDashboardTemplatesModel';

const launch = PRIVATE_LAUNCH_TEMPLATE;
const audit: ChecklistTemplate = { ...PRIVATE_LAUNCH_TEMPLATE, id: 'template-2', title: 'Content Audit' };

const startedRun: ChecklistRun = {
  id: 'run-9',
  templateId: 'template-2',
  title: 'Content Audit',
  status: 'in_progress',
  progress: 0,
  sections: [],
  startedAt: '2026-04-18T00:00:00.000Z',
  userId: 'user-1',
};

beforeEach(() => {
  inAnOrganization.role = undefined;
  signedIn.user = { id: 'user-1' };
  lists.allTemplates = [launch, audit];
  lists.createRun.mockReset();
  lists.deleteTemplate.mockReset();
  lists.deleteTemplate.mockResolvedValue(undefined);
  lists.refetchTemplates.mockClear();
  router.push.mockReset();
});

async function openMyTemplates() {
  let model: ReturnType<typeof useDashboardTemplatesModel> | undefined;
  function MyTemplates() {
    model = useDashboardTemplatesModel();
    return null;
  }
  await renderSettled(<MyTemplates />);
  return () => {
    if (!model) throw new Error('My Templates did not render');
    return model;
  };
}

describe('My Templates', () => {
  it('shows no templates and offers no run to a visitor who is not signed in', async () => {
    signedIn.user = null;
    const page = await openMyTemplates();

    expect(page().templates).toEqual([]);
    expect(page().isEmpty).toBe(true);
    expect(page().selectedTemplate).toBeNull();
    expect(page().preferenceOwnerId).toBeUndefined();

    await act(async () => page().openRunLauncher());
    expect(page().runLauncherOpen).toBe(false);
  });

  it('opens a template, a new template and the public library where they live', async () => {
    const page = await openMyTemplates();

    page().openTemplate(audit);
    page().openCreateTemplate();
    page().openPublicLibrary();

    expect(router.push.mock.calls.map(([href]) => href)).toEqual([
      '/dashboard/templates/template-2/edit/',
      '/dashboard/templates/new/',
      '/templates/',
    ]);
  });

  it('starts a run of the chosen template under the name typed, then opens it', async () => {
    const created = deferred<ChecklistRun | null>();
    lists.createRun.mockReturnValue(created.promise);
    const page = await openMyTemplates();

    await act(async () => page().openRunLauncher('template-2'));
    expect(page().runLauncherOpen).toBe(true);
    expect(page().selectedTemplate?.title).toBe('Content Audit');

    let starting: Promise<unknown> | undefined;
    await act(async () => {
      starting = page().createRunFromTemplate('Audit for April');
    });
    expect(page().isCreatingRun).toBe(true);

    created.resolve(startedRun);
    await act(async () => {
      expect(await starting).toEqual({ kind: 'ok', runId: 'run-9', teamId: undefined });
    });

    expect(lists.createRun).toHaveBeenCalledWith({ templateId: 'template-2', runName: 'Audit for April' });
    expect(page().isCreatingRun).toBe(false);
    expect(page().runLauncherOpen).toBe(false);
    expect(router.push).toHaveBeenCalledWith('/dashboard/runs/run-9/');
  });

  it('opens the launcher on the first template, and closes it without starting a run', async () => {
    const page = await openMyTemplates();

    await act(async () => page().openRunLauncher());
    expect(page().selectedTemplateId).toBe('template-1');

    await act(async () => page().closeRunLauncher());
    expect(page().runLauncherOpen).toBe(false);
    expect(lists.createRun).not.toHaveBeenCalled();
  });

  it('asks for a template before starting a run when the chosen one is gone', async () => {
    const page = await openMyTemplates();
    await act(async () => page().openRunLauncher('template-deleted'));

    await act(async () => {
      expect(await page().createRunFromTemplate()).toEqual({ kind: 'error', message: 'Select a template before starting a run.' });
    });
    expect(lists.createRun).not.toHaveBeenCalled();
  });

  it('chooses the next template after deleting the chosen one', async () => {
    const page = await openMyTemplates();

    await act(async () => page().removeTemplate('template-1'));

    expect(lists.deleteTemplate).toHaveBeenCalledWith('template-1');
    expect(page().selectedTemplateId).toBe('template-2');
  });

  it("lists an Organization's templates, and offers a viewer no way to create, edit or run them", async () => {
    inAnOrganization.role = 'viewer';
    lists.allTemplates = [launch, { ...audit, teamId: 'team-1' }];

    const page = await openMyTemplates();

    expect(page().templates.map(({ id }) => id)).toEqual(['template-2']);
    expect(page().isTeamWorkspace).toBe(true);
    expect(page()).toMatchObject({ canCreateTemplate: false, canEditTemplate: false, canRunTemplate: false, canCreateRun: false });
  });

  it('loads the templates again when asked to retry', async () => {
    const page = await openMyTemplates();

    page().retryLoad();

    expect(lists.refetchTemplates).toHaveBeenCalledTimes(1);
  });
});
