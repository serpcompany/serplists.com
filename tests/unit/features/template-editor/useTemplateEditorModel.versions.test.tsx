import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
  buildTemplateEditorSavedState,
  useTemplateEditorModel,
} from '@/features/template-editor/useTemplateEditorModel';
import { persistTemplateSave, type SaveTemplateInput } from '@/hooks/useTemplateSave';
import { applyTemplateSaveDefaults } from '@/hooks/useTemplateValidation';
import { buildTemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import type { TemplateSavePayload } from '@/types/checklist';

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
  it("returns the saved values built from what it sent, not from typing that changes react-hook-form's shallow-copied values in place", async () => {
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
    values.sections[0].items[0].description = 'Typed while saving';
    resolveSave({ success: true, errors: [], version: 2 });
    const result = await pending;

    expect(result.savedValues?.sections[0].items[0].description).toBe('Sent text');
    expect(result.savedValues?.title).toBe('Edited');
  });
});

describe('useTemplateEditorModel saved values after defaults', () => {
  it('returns what the real save path stored after defaults, so a second save sends the same placeholder task ids instead of churning every active run', async () => {
    vi.useFakeTimers();
    try {
      const sent: TemplateSavePayload[] = [];
      const versionTheStaticRenderNeverLoads = 1;
      const saveTemplate = (input: SaveTemplateInput) =>
        persistTemplateSave(
          {
            createTemplate: vi.fn(),
            updateTemplate: async (payload) => {
              sent.push(structuredClone(payload));
              return { version: sent.length + 1 };
            },
            applyDefaults: applyTemplateSaveDefaults,
          },
          { ...input, expectedVersion: input.expectedVersion ?? versionTheStaticRenderNeverLoads },
        );
      const model = captureModel('template-1', saveTemplate);
      const values = buildTemplateEditorFormValues({
        title: '',
        sections: [
          {
            id: 'section-1',
            title: 'Prep',
            items: [{ id: 'item-1', title: 'Task', contents: [] }],
          },
          { id: 'section-2', title: 'Phase 2', items: [] },
        ],
      });

      vi.setSystemTime(new Date('2026-09-28T10:00:00.000Z'));
      const first = await model.save(values);
      expect(first.success).toBe(true);
      expect(first.savedValues?.title).toBe('Untitled Template');
      expect(first.savedValues?.sections[1].items.map((item) => [item.id, item.title])).toEqual(
        sent[0].sections[1].items.map((item) => [item.id, item.title]),
      );

      vi.setSystemTime(new Date('2026-09-28T10:05:00.000Z'));
      await model.save(first.savedValues!);
      const itemIds = (payload: TemplateSavePayload) =>
        payload.sections.map((section) => section.items.map((item) => item.id));
      expect(itemIds(sent[1])).toEqual(itemIds(sent[0]));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useTemplateEditorModel saved slug', () => {
  it('shows the slug the server stored, with the suffix it adds to a taken slug, not the one requested', async () => {
    const saveTemplate = vi.fn().mockResolvedValue({
      success: true,
      errors: [],
      version: 2,
      slug: 'moving-checklist-1a2b3c4d',
    });
    const model = captureModel('template-1', saveTemplate);

    const result = await model.save(
      buildTemplateEditorFormValues({ title: 'Moving', seoUrl: 'Moving Checklist' }),
    );

    expect(saveTemplate).toHaveBeenCalledWith(expect.objectContaining({ seoUrl: 'moving-checklist' }));
    expect(result.savedValues?.seoUrl).toBe('moving-checklist-1a2b3c4d');
  });

  it('shows the slug the template kept when the field was cleared, since a cleared field sends no slug', () => {
    for (const typed of ['', '   ']) {
      const saved = buildTemplateEditorSavedState(
        buildTemplateEditorFormValues({ title: 'Moving', seoUrl: typed }),
        { storedSlug: 'moving-checklist' },
      );

      expect(saved.initialValues.seoUrl).toBe('moving-checklist');
      expect(saved.templateSlug).toBe('moving-checklist');
    }
  });
});
