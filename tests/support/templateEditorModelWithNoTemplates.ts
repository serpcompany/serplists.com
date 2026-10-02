import { vi } from 'vitest';

vi.mock('@/contexts/TemplatesContext', () => {
  const useTemplates = () => ({
    getTemplate: vi.fn(() => undefined),
  });
  return { useTemplates, useTemplateLists: useTemplates };
});

vi.mock('@/hooks/useTemplateSave', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useTemplateSave')>()),
  useTemplateSave: () => ({
    isSaving: false,
    saveTemplate: vi.fn(),
  }),
}));
