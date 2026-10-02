import { createFormControl } from 'react-hook-form';
import { z } from 'zod';

import {
  buildTemplateEditorFormValues,
  templateEditorFormSchema,
  type TemplateEditorContent,
  type TemplateEditorFormValues,
  type TemplateEditorItem,
  type TemplateEditorSection,
} from '@/lib/forms/templateEditorForm';

const editorSection = templateEditorFormSchema.shape.sections.element;
const editorItem = editorSection.shape.items.element;
const editorContents = editorItem.shape.contents.unwrap();

export const editorSectionsIn = (value: unknown): TemplateEditorSection[] => z.array(editorSection).parse(value ?? []);

export const editorItemsIn = (value: unknown): TemplateEditorItem[] => z.array(editorItem).parse(value ?? []);

export const editorContentsIn = (value: unknown): TemplateEditorContent[] => editorContents.parse(value ?? []);

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
