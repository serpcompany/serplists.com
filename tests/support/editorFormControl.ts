import { createFormControl } from 'react-hook-form';

import {
  buildTemplateEditorFormValues,
  type TemplateEditorFormValues,
} from '@/lib/forms/templateEditorForm';

export function createFormControlMountedLikeUseForm(template: Parameters<typeof buildTemplateEditorFormValues>[0]) {
  const form = createFormControl<TemplateEditorFormValues>({
    defaultValues: buildTemplateEditorFormValues(template),
  });
  form.control._state.mount = true;
  return form;
}

export type EditorForm = ReturnType<typeof createFormControlMountedLikeUseForm>;

export function editorFormOf(harness: { form: EditorForm | null }): EditorForm {
  if (!harness.form) throw new Error('The test made no editor form: call createForm() first');
  return harness.form;
}
