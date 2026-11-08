import { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  createTemplate: vi.fn<(payload: Record<string, unknown>) => Promise<{ id: string; slug: string }>>(),
  updateTemplate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: apiMock }));

import '../../support/templatesProviderHarness';
import { TemplatesProvider } from '@/contexts/TemplatesProvider';
import { useTemplateSave } from '@/hooks/useTemplateSave';

import { firstOf } from '../../support/elements';
import { renderSettled } from '../../support/renderInTheDom';

async function mountTheSaveHook() {
  let save: ReturnType<typeof useTemplateSave> | undefined;
  const Probe = () => {
    save = useTemplateSave();
    return null;
  };
  await renderSettled(
    <QueryClientProvider client={new QueryClient()}>
      <TemplatesProvider>
        <Probe />
      </TemplatesProvider>
    </QueryClientProvider>,
  );
  return () => {
    if (!save) throw new Error('useTemplateSave did not render');
    return save;
  };
}

const newTemplate = {
  title: '  ',
  description: '',
  sections: [],
  seoTitle: '',
  seoDescription: '',
  seoUrl: '',
  templateType: 'checklist' as const,
  categories: [],
  tags: [],
  requiredTools: [],
};

describe('useTemplateSave', () => {
  it('saves a new template with the defaults filled in, as private, and reports saving until the API answers', async () => {
    let answer: (value: { id: string; slug: string }) => void = () => undefined;
    apiMock.createTemplate.mockReturnValue(new Promise((resolve) => {
      answer = resolve;
    }));
    const save = await mountTheSaveHook();

    let saving: Promise<unknown> = Promise.resolve();
    act(() => {
      saving = save().saveTemplate(newTemplate);
    });
    expect(save().isSaving).toBe(true);

    await act(async () => {
      answer({ id: 'template-9', slug: 'untitled' });
      await saving;
    });

    expect(save().isSaving).toBe(false);
    await expect(saving).resolves.toMatchObject({ success: true, errors: [] });
    const [sent] = firstOf(apiMock.createTemplate.mock.calls);
    expect(sent).toMatchObject({ title: 'Untitled Template', is_public: false, sections: [{ title: 'Getting Started' }] });
  });
});
