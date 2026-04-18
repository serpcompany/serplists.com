import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import Templates from '@/pages/Templates';
import type { ChecklistTemplate } from '@/types/checklist';

const mockUseDashboardTemplatesModel = vi.fn();

vi.mock('@/features/dashboard-templates/useDashboardTemplatesModel', () => ({
  useDashboardTemplatesModel: (...args: unknown[]) =>
    mockUseDashboardTemplatesModel(...args),
}));

vi.mock('@/components/TemplateBackup', () => ({
  TemplateBackup: () => <div>Template backup</div>,
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
      <MemoryRouter>
        <Templates />
      </MemoryRouter>,
    );

    expect(html).toContain('My Templates');
    expect(html).toContain('templates in your library');
    expect(html).toContain('Search templates...');
    expect(html).toContain('Most Recent');
    expect(html).toContain('Start Run');
    expect(html).not.toContain('Beta workspace lane');
    expect(html).not.toContain('Owned templates');
    expect(html).not.toContain('Portable import and export');
  });
});
