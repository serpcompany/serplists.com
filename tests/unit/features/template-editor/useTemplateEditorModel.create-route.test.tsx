import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useTemplateEditorModel } from '@/features/template-editor/useTemplateEditorModel';

vi.mock('@/contexts/TemplatesContext', () => ({
  useTemplates: () => ({
    getTemplate: vi.fn(() => undefined),
  }),
}));

vi.mock('@/hooks/useTemplateSave', () => ({
  useTemplateSave: () => ({
    isSaving: false,
    saveTemplate: vi.fn(),
  }),
}));

function ModelHarness({ id }: { id?: string }): JSX.Element {
  const model = useTemplateEditorModel({ id });

  return <div>{model.loading ? 'loading' : 'ready'}</div>;
}

describe('useTemplateEditorModel create route', () => {
  it('renders the create route as ready on the first paint', () => {
    const html = renderToStaticMarkup(<ModelHarness />);

    expect(html).toContain('ready');
    expect(html).not.toContain('loading');
  });
});
