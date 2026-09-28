import { createFormControl } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import {
  cloneTemplateEditorFormValues,
  rebaseTemplateEditorFormAfterSave,
  resolvePostSaveFormState,
} from '@/features/template-editor/postSaveFormState';
import { buildTemplateEditorSavedState } from '@/features/template-editor/useTemplateEditorModel';
import {
  buildTemplateEditorFormValues,
  type TemplateEditorFormValues,
} from '@/lib/forms/templateEditorForm';

const loaded = (): TemplateEditorFormValues =>
  buildTemplateEditorFormValues({
    title: 'Launch checklist',
    description: 'Ship it.',
    seoUrl: 'launch-checklist',
    sections: [
      {
        id: 'section-1',
        title: 'Prep',
        items: [
          { id: 'item-1', title: 'Write notes', description: 'Draft', contents: [] },
          { id: 'item-2', title: 'Review', description: '', contents: [] },
        ],
      },
    ],
  });

// A real react-hook-form control, so reset() and isDirty behave as in the editor.
function createEditorForm() {
  const form = createFormControl<TemplateEditorFormValues>({ defaultValues: loaded() });
  // useForm marks the control mounted in an effect; until then getValues() reads defaults.
  form.control._state.mount = true;
  // The editor page reads formState.isDirty, which subscribes the form to it.
  let dirty = false;
  form.subscribe({
    formState: { isDirty: true },
    callback: (state) => {
      dirty = Boolean(state.isDirty);
    },
  });
  const isDirty = () => dirty;
  return { form, isDirty };
}

// What the page does around a save: snapshot at click time, then rebase on success.
function startSave(form: ReturnType<typeof createEditorForm>['form']) {
  const submitted = cloneTemplateEditorFormValues(form.getValues());
  return {
    submitted,
    finish: () =>
      rebaseTemplateEditorFormAfterSave(form, {
        submitted,
        saved: buildTemplateEditorSavedState(submitted, { storedSlug: 'launch-checklist' })
          .initialValues,
      }),
  };
}

describe('template editor post-save form state', () => {
  it('keeps a title typed while the save was in flight, and stays dirty', () => {
    const { form, isDirty } = createEditorForm();
    form.setValue('title', 'Launch checklist v2', { shouldDirty: true });

    const save = startSave(form);
    form.setValue('title', 'Launch checklist v3', { shouldDirty: true });
    save.finish();

    expect(form.getValues('title')).toBe('Launch checklist v3');
    expect(isDirty()).toBe(true);
    expect(form.control._defaultValues.title).toBe('Launch checklist v2');
  });

  it('keeps a task description typed while the save was in flight', () => {
    const { form, isDirty } = createEditorForm();
    form.setValue('sections.0.items.0.description', 'Sent text', { shouldDirty: true });

    const save = startSave(form);
    form.setValue('sections.0.items.0.description', 'Sent text, then more', {
      shouldDirty: true,
    });
    save.finish();

    expect(form.getValues('sections.0.items.0.description')).toBe('Sent text, then more');
    expect(save.submitted.sections[0]?.items[0]?.description).toBe('Sent text');
    expect(isDirty()).toBe(true);
    expect(form.control._defaultValues.sections?.[0]?.items?.[0]?.description).toBe('Sent text');
  });

  it('keeps a task added while the save was in flight', () => {
    const { form, isDirty } = createEditorForm();
    const save = startSave(form);
    const items = form.getValues('sections.0.items');
    form.setValue(
      'sections.0.items',
      [...items, { id: 'item-3', title: 'Added later', description: '', contents: [] }],
      { shouldDirty: true },
    );
    save.finish();

    expect(form.getValues('sections.0.items').map((item) => item.id)).toEqual([
      'item-1',
      'item-2',
      'item-3',
    ]);
    expect(isDirty()).toBe(true);
  });

  it('shows the saved, normalized values and is clean when nothing changed during the save', () => {
    const { form, isDirty } = createEditorForm();
    form.setValue('title', '  Launch checklist v2  ', { shouldDirty: true });

    startSave(form).finish();

    expect(form.getValues('title')).toBe('Launch checklist v2');
    expect(isDirty()).toBe(false);
  });

  it('normalizes the fields that were not edited during the save', () => {
    const { form, isDirty } = createEditorForm();
    form.setValue('title', '  Launch checklist v2  ', { shouldDirty: true });

    const save = startSave(form);
    form.setValue('description', 'Ship it today.', { shouldDirty: true });
    save.finish();

    expect(form.getValues('title')).toBe('Launch checklist v2');
    expect(form.getValues('description')).toBe('Ship it today.');
    expect(isDirty()).toBe(true);
  });
});

describe('resolvePostSaveFormState', () => {
  it('does not treat normalization of the sent values as an edit', () => {
    const submitted = { ...loaded(), title: ' Padded ' };
    const saved = buildTemplateEditorSavedState(submitted).initialValues;

    const state = resolvePostSaveFormState({
      submitted,
      current: cloneTemplateEditorFormValues(submitted),
      saved,
    });

    expect(state.keptEdits).toBe(false);
    expect(state.values).toBe(saved);
  });

  it('treats a missing optional field and an undefined one as equal', () => {
    const submitted = loaded();
    const current = cloneTemplateEditorFormValues(submitted);
    delete current.sections[0].items[0].isCompleted;
    expect('isCompleted' in submitted.sections[0].items[0]).toBe(true);

    const state = resolvePostSaveFormState({ submitted, current, saved: submitted });

    expect(state.keptEdits).toBe(false);
  });
});
