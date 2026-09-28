import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi, afterEach } from 'vitest';

import { Layout } from '@/components/Layout';
import { mergeAccountTemplateCollections } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  buildDashboardTemplatesState,
  createDashboardTemplateRun,
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

    const html = renderToStaticMarkup(
      React.createElement(
        StaticRouter,
        { location: '/dashboard/templates' },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, {
            path: '*',
            element: React.createElement(
              Layout,
              null,
              React.createElement('div', null, 'Authenticated page'),
            ),
          }),
        ),
      ),
    );

    expect(html).toContain('href="/dashboard/templates"');
    expect(html).toContain('href="/dashboard/runs"');
    expect(html).toContain('href="/dashboard/settings"');
    expect(html).not.toContain('href="/dashboard/profile"');
    expect(html).not.toContain('href="/console"');
    expect(html).not.toContain('href="/console/templates"');
    expect(html).not.toContain('href="/console/runs"');
  });
});

describe('buildDashboardTemplatesState', () => {
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
});

describe('dashboard template lane actions', () => {
  it('opens canonical dashboard and public-library destinations', () => {
    const navigate = vi.fn();

    openDashboardTemplate(navigate, 'template-9');
    openDashboardCreateTemplate(navigate);
    openDashboardPublicLibrary(navigate);

    expect(navigate.mock.calls).toEqual([
      ['/dashboard/templates/template-9/edit'],
      ['/dashboard/templates/new'],
      ['/templates'],
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

  it('returns an error when the run mutation resolves without an id', async () => {
    const createRun = vi.fn().mockResolvedValue(null);

    const result = await createDashboardTemplateRun(
      {
        templateId: 'template-1',
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
      },
      { createRun },
    );

    expect(result).toEqual({
      kind: 'error',
      message: 'Mutation failed',
    });
  });
});
