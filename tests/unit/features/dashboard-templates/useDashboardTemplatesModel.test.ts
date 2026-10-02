import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { Layout } from '@/components/Layout';
import { BILLING_UNAVAILABLE_MESSAGE, createApiError } from '@/lib/api-errors';
import { mergeAccountTemplateCollections } from '@/lib/repoTemplateCatalog';
import { buildDefaultRunName } from '@/lib/runs/runName';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  buildDashboardTemplatesState,
  createDashboardTemplateRun,
  deleteDashboardTemplate,
  finishDashboardTemplateRun,
  getDashboardSelectedTemplate,
  getInitialDashboardTemplateId,
  openDashboardCreateTemplate,
  openDashboardPublicLibrary,
  openDashboardTemplate,
  reportDashboardTemplateRunFailure,
} from '@/features/dashboard-templates/useDashboardTemplatesModel';
import { navigation } from '../../../support/nextNavigation';

vi.mock('next/navigation', async () => (await import('../../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../../support/nextNavigation')).nextLinkMock);

const authState = vi.hoisted(() => ({
  logout: vi.fn(),
  user: null as
    | {
        email: string;
        id: string;
        name: string;
        username?: string;
      }
    | null,
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: undefined,
    activeWorkspace: {
      id: 'personal',
      name: 'Personal',
      role: 'owner',
      type: 'personal',
    },
    canEditTemplates: true,
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

const buildTemplate = (
  overrides: Partial<ChecklistTemplate> = {},
): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Content Audit',
  description: 'Audit a landing page end to end.',
  type: 'checklist',
  sections: [
    {
      id: 'section-1',
      title: 'Prep',
      items: [
        { id: 'item-1', title: 'Capture goals' },
        { id: 'item-2', title: 'Export queries' },
      ],
    },
  ],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: false,
  categories: ['SEO'],
  tags: ['audit'],
  ...overrides,
});

afterEach(() => {
  authState.user = null;
  authState.logout.mockReset();
});

describe('signed-in layout navigation', () => {
  it('shows canonical dashboard, templates, runs, and settings destinations for authenticated users', () => {
    authState.user = {
      id: 'user-1',
      name: 'Alice Example',
      email: 'alice@example.com',
      username: 'alice',
    };

    navigation.reset('/dashboard/templates/');
    const html = renderToStaticMarkup(
      React.createElement(Layout, null, React.createElement('div', null, 'Authenticated page')),
    );

    expect(html).toContain('href="/dashboard/templates/"');
    expect(html).toContain('href="/dashboard/runs/"');
    expect(html).toContain('href="/dashboard/settings/"');
    expect(html).not.toContain('href="/dashboard/profile');
    expect(html).not.toContain('href="/console');
  });
});

describe('buildDashboardTemplatesState', () => {
  it('follows the Organization role instead of always offering to create', () => {
    const allTemplates = [buildTemplate({ teamId: 'team-1', userId: 'someone-else' })];
    const stateFor = (role?: 'viewer' | 'runner' | 'editor') =>
      buildDashboardTemplatesState({ allTemplates, role, teamId: 'team-1', userId: 'user-1' });

    expect(stateFor('viewer')).toMatchObject({
      canCreateRun: false,
      canCreateTemplate: false,
      canEditTemplate: false,
      canRunTemplate: false,
    });
    expect(stateFor('runner')).toMatchObject({
      canCreateRun: true,
      canCreateTemplate: false,
      canEditTemplate: false,
      canRunTemplate: true,
    });
    expect(stateFor('editor')).toMatchObject({
      canCreateTemplate: true,
      canEditTemplate: true,
      canRunTemplate: true,
    });
    expect(stateFor(undefined).canRunTemplate).toBe(false);
  });

  it('keeps full rights in the Personal context', () => {
    const state = buildDashboardTemplatesState({ allTemplates: [buildTemplate()], userId: 'user-1' });

    expect(state).toMatchObject({ canCreateTemplate: true, canEditTemplate: true, canRunTemplate: true });
  });

  it('returns only owned templates and dashboard CTA state', () => {
    const state = buildDashboardTemplatesState({
      allTemplates: [
        buildTemplate({
          id: 'template-1',
          sections: [
            {
              id: 'section-1',
              title: 'Prep',
              items: [{ id: 'item-1', title: 'Capture goals' }],
            },
          ],
        }),
        buildTemplate({
          id: 'template-2',
          userId: 'user-2',
          sections: [
            {
              id: 'section-2',
              title: 'External',
              items: [{ id: 'item-2', title: 'Ignore this' }],
            },
          ],
        }),
        buildTemplate({
          id: 'template-3',
          sections: [
            {
              id: 'section-3',
              title: 'Execution',
              items: [
                { id: 'item-3', title: 'Open dashboard' },
                { id: 'item-4', title: 'Start run' },
              ],
            },
          ],
        }),
      ],
      templatesLoading: false,
      userId: 'user-1',
    });

    expect(state.templates.map((template) => template.id)).toEqual([
      'template-1',
      'template-3',
    ]);
    expect(state.loading).toBe(false);
    expect(state.isEmpty).toBe(false);
    expect(state.canCreateTemplate).toBe(true);
    expect(state.canCreateRun).toBe(true);
    expect(state.totalTemplateItems).toBe(3);
  });

  it('treats missing owned templates as an empty state while keeping create CTA available', () => {
    const state = buildDashboardTemplatesState({
      allTemplates: [buildTemplate({ userId: 'someone-else' })],
      templatesLoading: false,
      userId: 'user-1',
    });

    expect(state.templates).toEqual([]);
    expect(state.isEmpty).toBe(true);
    expect(state.canCreateTemplate).toBe(true);
    expect(state.canCreateRun).toBe(false);
    expect(state.totalTemplateItems).toBe(0);
  });

  it('drops a deleted public template that is still in the cached public catalog', () => {
    const deleted = buildTemplate({ id: 'deleted-public', title: 'Deleted Public', isPublic: true });
    const kept = buildTemplate({ id: 'kept', title: 'Kept' });
    const state = buildDashboardTemplatesState({
      allTemplates: mergeAccountTemplateCollections([deleted], [kept], 'user-1'),
      templatesLoading: false,
      userId: 'user-1',
    });

    expect(state.templates.map((template) => template.id)).toEqual(['kept']);
    expect(state.canCreateRun).toBe(true);
  });

  it('keeps loading true while the source data is still resolving', () => {
    const state = buildDashboardTemplatesState({
      allTemplates: [],
      templatesLoading: true,
      userId: 'user-1',
    });

    expect(state.loading).toBe(true);
    expect(state.isEmpty).toBe(false);
    expect(state.canCreateRun).toBe(false);
  });

  it('leaves an Organization template from the public catalog, whose rows have no team_id, out of Personal by its owner type', () => {
    const state = buildDashboardTemplatesState({
      allTemplates: [
        buildTemplate({ id: 'personal', ownerType: 'user' }),
        buildTemplate({ id: 'org-from-catalog', ownerType: 'team', isPublic: true }),
        buildTemplate({ id: 'org-from-workspace', teamId: 'org-1' }),
      ],
      userId: 'user-1',
    });

    expect(state.templates.map((template) => template.id)).toEqual(['personal']);
  });
});

describe('dashboard template lane actions', () => {
  it('opens canonical dashboard and public-library destinations', () => {
    const navigate = vi.fn();

    openDashboardTemplate(navigate, 'template-9');
    openDashboardCreateTemplate(navigate);
    openDashboardPublicLibrary(navigate);

    expect(navigate.mock.calls).toEqual([
      ['/dashboard/templates/template-9/edit/'],
      ['/dashboard/templates/new/'],
      ['/templates/'],
    ]);
  });

  it('selects the first owned template for launch flows and resolves the current selection', () => {
    const templates = [
      buildTemplate({ id: 'template-1', title: 'First template' }),
      buildTemplate({ id: 'template-2', title: 'Second template' }),
    ];

    expect(getInitialDashboardTemplateId(templates)).toBe('template-1');
    expect(getDashboardSelectedTemplate(templates, 'template-2')).toEqual(
      expect.objectContaining({
        id: 'template-2',
        title: 'Second template',
      }),
    );
    expect(getDashboardSelectedTemplate(templates, 'missing')).toBeNull();
  });

  it('deletes templates and preserves or advances the run-launch selection', async () => {
    const deleteTemplate = vi.fn();
    const templates = [
      buildTemplate({ id: 'template-1', title: 'First template' }),
      buildTemplate({ id: 'template-2', title: 'Second template' }),
    ];

    const unchangedSelection = await deleteDashboardTemplate(
      {
        selectedTemplateId: 'template-2',
        templateId: 'template-1',
        templates,
      },
      { deleteTemplate },
    );

    const nextSelection = await deleteDashboardTemplate(
      {
        selectedTemplateId: 'template-1',
        templateId: 'template-1',
        templates,
      },
      { deleteTemplate },
    );

    expect(deleteTemplate).toHaveBeenCalledTimes(2);
    expect(deleteTemplate).toHaveBeenNthCalledWith(1, 'template-1');
    expect(deleteTemplate).toHaveBeenNthCalledWith(2, 'template-1');
    expect(unchangedSelection).toBe('template-2');
    expect(nextSelection).toBe('template-2');
  });
});

describe('createDashboardTemplateRun', () => {
  it('creates a run from the requested template and returns its run id', async () => {
    const createRun = vi.fn().mockResolvedValue({ id: 'run-9' });

    const result = await createDashboardTemplateRun(
      {
        runName: 'Audit sprint',
        templateId: 'template-1',
        templateTitle: 'Content Audit',
      },
      { createRun },
    );

    expect(createRun).toHaveBeenCalledWith({
      templateId: 'template-1',
      runName: 'Audit sprint',
    });
    expect(result).toEqual({
      kind: 'ok',
      runId: 'run-9',
    });
  });

  it('names a run left blank after the template and start time, as the dialog shows', async () => {
    const createRun = vi.fn().mockResolvedValue({ id: 'run-10' });
    const now = new Date('2026-09-28T10:15:00.000Z');

    for (const runName of [undefined, '', '   ']) {
      createRun.mockClear();
      await createDashboardTemplateRun(
        { now, runName, templateId: 'template-1', templateTitle: 'Moving Checklist' },
        { createRun },
      );

      expect(createRun).toHaveBeenCalledWith({
        templateId: 'template-1',
        runName: buildDefaultRunName('Moving Checklist', now),
      });
    }
    expect(buildDefaultRunName('Moving Checklist', now)).toMatch(/^Moving Checklist - /);
  });

  it('trims a typed run name', async () => {
    const createRun = vi.fn().mockResolvedValue({ id: 'run-11' });

    await createDashboardTemplateRun(
      { runName: '  Spring move  ', templateId: 'template-1', templateTitle: 'Moving Checklist' },
      { createRun },
    );

    expect(createRun).toHaveBeenCalledWith({ templateId: 'template-1', runName: 'Spring move' });
  });

  it('returns an error when the run mutation resolves without an id', async () => {
    const createRun = vi.fn().mockResolvedValue(null);

    const result = await createDashboardTemplateRun(
      {
        templateId: 'template-1',
        templateTitle: 'Content Audit',
      },
      { createRun },
    );

    expect(result).toEqual({
      kind: 'error',
      message: 'Failed to create checklist run.',
    });
  });

  it('normalizes thrown mutation errors into a user-facing error result', async () => {
    const createRun = vi.fn().mockRejectedValue(new Error('Mutation failed'));

    const result = await createDashboardTemplateRun(
      {
        templateId: 'template-1',
        templateTitle: 'Content Audit',
      },
      { createRun },
    );

    expect(result).toEqual({
      kind: 'error',
      message: 'Mutation failed',
    });
  });
});

describe('finishDashboardTemplateRun', () => {
  const run = { kind: 'ok' as const, runId: 'run-9' };

  it('opens the new run while the user is still on the page', () => {
    const closeLauncher = vi.fn();
    const navigate = vi.fn();

    finishDashboardTemplateRun(run, { isCurrent: () => true }, { closeLauncher, navigate });

    expect(closeLauncher).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/dashboard/runs/run-9/');
  });

  it('does not pull a user who left the page, with Back for example, to the new run, and still closes the launcher since the run exists', () => {
    const closeLauncher = vi.fn();
    const navigate = vi.fn();

    finishDashboardTemplateRun(run, { isCurrent: () => false }, { closeLauncher, navigate });

    expect(navigate).not.toHaveBeenCalled();
    expect(closeLauncher).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a failed run', () => {
    const closeLauncher = vi.fn();
    const navigate = vi.fn();

    finishDashboardTemplateRun(
      { kind: 'error', message: 'Failed' },
      { isCurrent: () => true },
      { closeLauncher, navigate },
    );

    expect(navigate).not.toHaveBeenCalled();
    expect(closeLauncher).not.toHaveBeenCalled();
  });
});

describe('createDashboardTemplateRun access failures', () => {
  const runLimitMessage =
    'Active run limit reached. Upgrade to Pro to create more checklist runs.';

  const runWithFailure = (error: unknown) =>
    createDashboardTemplateRun(
      { templateId: 'template-1', templateTitle: 'Content Audit' },
      { createRun: vi.fn().mockRejectedValue(error) },
    );

  it('returns upgrade_required when the run limit is reached', async () => {
    const result = await runWithFailure(
      createApiError(403, { error: runLimitMessage, code: 'limit_reached' }),
    );

    expect(result).toEqual({ kind: 'upgrade_required', message: runLimitMessage });
  });

  it('returns upgrade_required when the context needs a paid plan', async () => {
    const result = await runWithFailure(
      createApiError(403, { error: 'Upgrade required', code: 'upgrade_required' }),
    );

    expect(result).toEqual({ kind: 'upgrade_required', message: 'Upgrade required' });
  });

  it('returns login_required when the session has expired', async () => {
    const result = await runWithFailure(createApiError(401, { error: 'Unauthorized' }));

    expect(result).toEqual({ kind: 'login_required' });
  });

  it('keeps a plain 403 without a code as an error, not an upgrade', async () => {
    const result = await runWithFailure(createApiError(403, { error: 'Forbidden' }));

    expect(result).toEqual({ kind: 'error', message: 'Forbidden' });
  });

  it('reports billing_unavailable with the billing message', async () => {
    const result = await runWithFailure(
      createApiError(503, { error: 'Billing down', code: 'billing_unavailable' }),
    );

    expect(result).toEqual({ kind: 'error', message: BILLING_UNAVAILABLE_MESSAGE });
  });
});

describe('reportDashboardTemplateRunFailure', () => {
  const current = { isCurrent: () => true };
  const left = { isCurrent: () => false };
  const buildActions = (upgradeResult = true) => ({
    navigateToLogin: vi.fn(),
    showError: vi.fn(),
    upgrade: vi.fn().mockResolvedValue(upgradeResult),
  });

  it('starts the upgrade flow instead of showing the limit message', async () => {
    const actions = buildActions(true);

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'upgrade_required', message: 'Active run limit reached.' },
      current,
      actions,
    );

    expect(actions.upgrade).toHaveBeenCalledTimes(1);
    expect(actions.showError).not.toHaveBeenCalled();
    expect(actions.navigateToLogin).not.toHaveBeenCalled();
    expect(redirecting).toBe(true);
  });

  it('reports when the upgrade flow did not redirect', async () => {
    const actions = buildActions(false);

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'upgrade_required', message: 'Active run limit reached.' },
      current,
      actions,
    );

    expect(redirecting).toBe(false);
  });

  it('sends an expired session to login', async () => {
    const actions = buildActions();

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'login_required' },
      current,
      actions,
    );

    expect(actions.navigateToLogin).toHaveBeenCalledTimes(1);
    expect(actions.showError).not.toHaveBeenCalled();
    expect(actions.upgrade).not.toHaveBeenCalled();
    expect(redirecting).toBe(false);
  });

  it('shows other errors exactly once', async () => {
    const actions = buildActions();

    await reportDashboardTemplateRunFailure(
      { kind: 'error', message: 'Failed to create checklist run.' },
      current,
      actions,
    );

    expect(actions.showError).toHaveBeenCalledTimes(1);
    expect(actions.showError).toHaveBeenCalledWith('Failed to create checklist run.');
    expect(actions.upgrade).not.toHaveBeenCalled();
  });

  it('does not start checkout once the user has left My Templates, so it never pulls them from the page they moved to', async () => {
    const actions = buildActions(true);

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'upgrade_required', message: 'Active run limit reached.' },
      left,
      actions,
    );

    expect(actions.upgrade).not.toHaveBeenCalled();
    expect(actions.navigateToLogin).not.toHaveBeenCalled();
    expect(redirecting).toBe(false);
  });

  it('does not go to sign-in once the user has left the page', async () => {
    const actions = buildActions();

    const redirecting = await reportDashboardTemplateRunFailure(
      { kind: 'login_required' },
      left,
      actions,
    );

    expect(actions.navigateToLogin).not.toHaveBeenCalled();
    expect(actions.upgrade).not.toHaveBeenCalled();
    expect(redirecting).toBe(false);
  });

  it('still reports a plain error after the user has left the page', async () => {
    const actions = buildActions();

    await reportDashboardTemplateRunFailure(
      { kind: 'error', message: 'Failed to create checklist run.' },
      left,
      actions,
    );

    expect(actions.showError).toHaveBeenCalledWith('Failed to create checklist run.');
  });
});
