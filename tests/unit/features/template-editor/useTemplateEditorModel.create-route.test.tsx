import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useTemplateEditorModel } from '@/features/template-editor/useTemplateEditorModel';

vi.mock('@/contexts/TemplatesContext', () => {
  const useTemplates = () => ({
    getTemplate: vi.fn(() => undefined),
  });
  return { useTemplates, useTemplateLists: useTemplates };
});

vi.mock('@/hooks/useTemplateSave', () => ({
  useTemplateSave: () => ({
    isSaving: false,
    saveTemplate: vi.fn(),
  }),
}));

function ModelHarness({ id }: { id?: string }): JSX.Element {
  const model = useTemplateEditorModel({ id });

  return (
    <div>
      <span>{model.loading ? 'loading' : 'ready'}</span>
      <span>title:{model.initialValues.title}</span>
      <span>description:{model.initialValues.description}</span>
      <span>sections:{model.initialValues.sections.length}</span>
      <span>first-section:{model.initialValues.sections[0]?.title}</span>
    </div>
  );
}

describe('useTemplateEditorModel create route', () => {
  it('renders the create route as ready on the first paint', () => {
    const html = renderToStaticMarkup(<ModelHarness />);

    expect(html).toContain('ready');
    expect(html).not.toContain('loading');
  });

  it('starts from a blank main-branch create-template state', () => {
    const html = renderToStaticMarkup(<ModelHarness />);

    expect(html).toContain('title:</span>');
    expect(html).toContain('description:</span>');
    expect(html).toContain('sections:1');
    expect(html).toContain('first-section:</span>');
    expect(html).not.toContain('New Employee Onboarding');
  });
});
