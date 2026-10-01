import { navigation } from '../../../support/mockedNextNavigation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { Layout } from '@/components/Layout';
import { mergeAccountTemplateCollections } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  buildDashboardTemplatesState,
  deleteDashboardTemplate,
  getDashboardSelectedTemplate,
  getInitialDashboardTemplateId,
  openDashboardCreateTemplate,
  openDashboardPublicLibrary,
  openDashboardTemplate,
} from '@/features/dashboard-templates/useDashboardTemplatesModel';

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
