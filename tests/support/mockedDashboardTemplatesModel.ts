import { vi } from 'vitest';

import type { useDashboardTemplatesModel } from '@/features/dashboard-templates/useDashboardTemplatesModel';
import { PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import type { ChecklistTemplate } from '@/types/checklist';

type DashboardTemplatesModel = ReturnType<typeof useDashboardTemplatesModel>;

export const dashboardTemplates = {
  model: vi.fn<() => Partial<DashboardTemplatesModel>>(),
  viewMode: 'grid' as 'grid' | 'list',
};

vi.mock('@/features/dashboard-templates/useDashboardTemplatesModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/dashboard-templates/useDashboardTemplatesModel')>()),
  useDashboardTemplatesModel: () => dashboardTemplates.model(),
}));
vi.mock('@/hooks/useViewModePreference', () => ({
  useViewModePreference: () => [dashboardTemplates.viewMode, vi.fn()],
}));

export const websiteLaunchTemplate = (overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate => ({
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

export const NO_TEMPLATES = { templates: [], isEmpty: true, canCreateRun: false, totalTemplateItems: 0 };

export const showTheTemplatesModel = (overrides: Partial<DashboardTemplatesModel> = {}) =>
  dashboardTemplates.model.mockReturnValue({
    templates: [websiteLaunchTemplate()],
    loading: false,
    loadError: null,
    isEmpty: false,
    canCreateRun: true,
    canCreateTemplate: true,
    canEditTemplate: true,
    canRunTemplate: true,
    consoleContext: PERSONAL_CONSOLE,
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
    createRunFromTemplate: vi.fn(),
    retryLoad: vi.fn(),
    preferenceOwnerId: 'user-1',
    ...overrides,
  });
