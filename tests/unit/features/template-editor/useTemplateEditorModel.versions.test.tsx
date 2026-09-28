import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { useTemplateEditorModel } from '@/features/template-editor/useTemplateEditorModel';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';

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

type EditorModel = ReturnType<typeof useTemplateEditorModel>;

function captureModel(
  id: string,
  saveTemplate: NonNullable<Parameters<typeof useTemplateEditorModel>[1]>['saveTemplate'],
): EditorModel {
  let captured: EditorModel | undefined;
  function Harness(): JSX.Element {
    captured = useTemplateEditorModel({ id }, { saveTemplate });
    return <span />;
  }
  renderToStaticMarkup(<Harness />);
  return captured!;
}

describe('useTemplateEditorModel versions', () => {
  it('sends the version returned by the previous save, not a list refetch', async () => {
    const saveTemplate = vi
      .fn()
      .mockResolvedValueOnce({ success: true, errors: [], version: 8 })
      .mockResolvedValueOnce({ success: true, errors: [], version: 9 });
    const model = captureModel('template-1', saveTemplate);
    const values = buildTemplateEditorFormValues({ title: 'Edited' });

    await model.save(values);
    await model.save(values);

    expect(saveTemplate).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'template-1', expectedVersion: 8 }),
    );
  });

  it('keeps the loaded version after a failed save', async () => {
    const saveTemplate = vi
      .fn()
      .mockResolvedValueOnce({ success: true, errors: [], version: 4 })
      .mockResolvedValueOnce({
        success: false,
        errors: [{ type: 'save', message: 'Template changed since it was loaded.' }],
      })
      .mockResolvedValueOnce({ success: true, errors: [], version: 5 });
    const model = captureModel('template-1', saveTemplate);
    const values = buildTemplateEditorFormValues({ title: 'Edited' });

    await model.save(values);
    await model.save(values);
    await model.save(values);

    expect(saveTemplate).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 4 }),
    );
  });
});
