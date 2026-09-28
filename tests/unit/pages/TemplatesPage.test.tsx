import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it, vi } from 'vitest';

import Templates from '@/pages/Templates';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseDashboardTemplatesModel = vi.fn();

vi.mock('@/features/dashboard-templates/useDashboardTemplatesModel', () => ({
  useDashboardTemplatesModel: (...args: unknown[]) =>
    mockUseDashboardTemplatesModel(...args),
}));

const viewModeState = vi.hoisted(() => ({ mode: 'grid' as 'grid' | 'list' }));

vi.mock('@/hooks/useViewModePreference', () => ({
  useViewModePreference: () => [viewModeState.mode, vi.fn()],
}));

const template = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
  id: 'template-1',
  title: 'Website Launch Checklist',
  description: 'Complete checklist for launching a new website.',
  type: 'checklist',
  sections: [
    {
      id: 'section-1',
      title: 'Launch prep',
      items: [
        { id: 'item-1', title: 'Freeze content', description: '', contents: [] },
        { id: 'item-2', title: 'Check redirects', description: '', contents: [] },
      ],
    },
  ],
  userId: 'user-1',
  createdAt: '2026-04-18T00:00:00.000Z',
  updatedAt: '2026-04-18T00:00:00.000Z',
  isPublic: true,
  categories: ['Web Development', 'Launch'],
  tags: [],
  ...overrides,
});

describe('Templates page', () => {
  it('renders the exact dashboard-templates lane instead of the local beta workspace copy', () => {
    mockUseDashboardTemplatesModel.mockReturnValue({
      templates: [template()],
      loading: false,
      isEmpty: false,
      canCreateRun: true,
      canCreateTemplate: true,
      canEditTemplate: true,
      canRunTemplate: true,
      totalTemplateItems: 2,
      selectedTemplate: template(),
      selectedTemplateId: 'template-1',
      runLauncherOpen: false,
      isCreatingRun: false,
      openCreateTemplate: vi.fn(),
      openRunLauncher: vi.fn(),
      openPublicLibrary: vi.fn(),
      openTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      closeRunLauncher: vi.fn(),
      selectRunTemplate: vi.fn(),
      createRunFromTemplate: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <Templates />
      </StaticRouter>,
    );

    expect(html).toContain('My Templates');
    expect(html).toContain('data-dashboard-content-shell="true"');
    expect(html).toContain('data-dashboard-page-header="true"');
    expect(html).toContain('templates in your library');
    expect(html).toContain('Search templates...');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('Start Run');
    expect(html).not.toContain('Portable import and export');
    expect(html).not.toContain('Template JSON Import');
    expect(html).not.toContain('Beta workspace lane');
    expect(html).not.toContain('Owned templates');
  });

  it('renders the reference empty state instead of the generic local fallback copy', () => {
    mockUseDashboardTemplatesModel.mockReturnValue({
      templates: [],
      loading: false,
      isEmpty: true,
      canCreateRun: false,
      canCreateTemplate: true,
      canEditTemplate: true,
      canRunTemplate: true,
      totalTemplateItems: 0,
      selectedTemplate: null,
      selectedTemplateId: '',
      runLauncherOpen: false,
      isCreatingRun: false,
      openCreateTemplate: vi.fn(),
      openRunLauncher: vi.fn(),
      openPublicLibrary: vi.fn(),
      openTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      closeRunLauncher: vi.fn(),
      selectRunTemplate: vi.fn(),
      createRunFromTemplate: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <Templates />
      </StaticRouter>,
    );

    expect(html).toContain('No templates found');
    expect(html).toContain('Create Template');
    expect(html).not.toContain('No templates matched this view.');
  });

  it.each(['grid', 'list'] as const)('offers an Organization viewer no create, run, edit or delete actions (%s view)', (viewMode) => {
    viewModeState.mode = viewMode;
    mockUseDashboardTemplatesModel.mockReturnValue({
      templates: [template({ teamId: 'team-1' })],
      loading: false,
      isEmpty: false,
      canCreateRun: false,
      canCreateTemplate: false,
      canEditTemplate: false,
      canRunTemplate: false,
      totalTemplateItems: 2,
      selectedTemplate: null,
      selectedTemplateId: '',
      runLauncherOpen: false,
      isCreatingRun: false,
      openCreateTemplate: vi.fn(),
      openRunLauncher: vi.fn(),
      openPublicLibrary: vi.fn(),
      openTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      closeRunLauncher: vi.fn(),
      selectRunTemplate: vi.fn(),
      createRunFromTemplate: vi.fn(),
      preferenceOwnerId: 'user-1',
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <Templates />
      </StaticRouter>,
    );

    expect(html).toContain('Website Launch Checklist');
    expect(html).not.toContain('New Template');
    expect(html).not.toContain('Start Run');
    expect(html).not.toContain('/edit"');
    expect(html).not.toContain('Delete');
  });

  it('hides Create Template in the empty state for members who cannot create Templates', () => {
    mockUseDashboardTemplatesModel.mockReturnValue({
      templates: [],
      loading: false,
      isEmpty: true,
      canCreateRun: false,
      canCreateTemplate: false,
      canEditTemplate: false,
      canRunTemplate: true,
      totalTemplateItems: 0,
      selectedTemplate: null,
      selectedTemplateId: '',
      runLauncherOpen: false,
      isCreatingRun: false,
      openCreateTemplate: vi.fn(),
      openRunLauncher: vi.fn(),
      openPublicLibrary: vi.fn(),
      openTemplate: vi.fn(),
      removeTemplate: vi.fn(),
      closeRunLauncher: vi.fn(),
      selectRunTemplate: vi.fn(),
      createRunFromTemplate: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <StaticRouter location="/">
        <Templates />
      </StaticRouter>,
    );

    expect(html).toContain('No templates found');
    expect(html).not.toContain('Create Template');
  });
});

