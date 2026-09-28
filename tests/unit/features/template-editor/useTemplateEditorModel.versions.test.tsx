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

describe('useTemplateEditorModel saved values', () => {
  it('returns the saved values built from what it sent, not from later edits', async () => {
    let resolveSave: (value: { success: boolean; errors: []; version: number }) => void = () => {};
    const saveTemplate = vi.fn(
      () =>
        new Promise<{ success: boolean; errors: []; version: number }>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const model = captureModel('template-1', saveTemplate);
    const values = buildTemplateEditorFormValues({
      title: 'Edited',
      sections: [
        {
          id: 'section-1',
          title: 'Prep',
          items: [{ id: 'item-1', title: 'Task', description: 'Sent text', contents: [] }],
        },
      ],
    });

    const pending = model.save(values);
    // react-hook-form's getValues() is a shallow copy: typing changes nested objects in place.
    values.sections[0].items[0].description = 'Typed while saving';
    resolveSave({ success: true, errors: [], version: 2 });
    const result = await pending;

    expect(result.savedValues?.sections[0].items[0].description).toBe('Sent text');
    expect(result.savedValues?.title).toBe('Edited');
  });
});
