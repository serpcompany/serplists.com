import { vi } from 'vitest';

import { REPO_TEMPLATE_USER_ID } from '@/lib/repoTemplateCatalog';
import type { ChecklistTemplate } from '@/types/checklist';
import type { useTemplateLibrary } from '@/hooks/useTemplateLibrary';

type TemplateLibrary = ReturnType<typeof useTemplateLibrary>;
type TemplateLibraryArgs = Parameters<typeof useTemplateLibrary>;

export const mockUseTemplateLibrary = vi.fn<(...args: TemplateLibraryArgs) => Partial<TemplateLibrary>>();

vi.mock('@/hooks/useTemplateLibrary', () => ({
  useTemplateLibrary: (...args: TemplateLibraryArgs) => mockUseTemplateLibrary(...args),
}));

export const baseTemplate: ChecklistTemplate = {
  id: 'template-1',
  title: 'Template',
  sections: [],
  userId: 'user-1',
  createdAt: '2026-03-24T00:00:00.000Z',
  updatedAt: '2026-03-24T00:00:00.000Z',
  isPublic: true,
};

export const bundledTemplate: ChecklistTemplate = {
  ...baseTemplate,
  id: 'repo:camping',
  slug: 'camping',
  title: 'Camping Checklist',
  categories: ['outdoor'],
  userId: REPO_TEMPLATE_USER_ID,
};

export const movingTemplate: ChecklistTemplate = {
  ...baseTemplate,
  id: 'db-moving',
  slug: 'moving-day',
  title: 'Moving Day',
  categories: ['moving'],
  ownerProfile: { username: 'alice' },
};

export const libraryState = (overrides: Partial<TemplateLibrary>): Partial<TemplateLibrary> => ({
  templates: [bundledTemplate],
  loading: false,
  catalogError: false,
  retryCatalog: vi.fn(),
  allCategories: ['moving', 'outdoor'],
  ...overrides,
});
