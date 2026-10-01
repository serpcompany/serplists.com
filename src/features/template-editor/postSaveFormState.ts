import type { UseFormReturn } from "react-hook-form";

import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

export const cloneTemplateEditorFormValues = (
  values: TemplateEditorFormValues,
): TemplateEditorFormValues => structuredClone(values);

export const templateEditorValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((entry, index) => templateEditorValuesEqual(entry, right[index]))
    );
  }

  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
  return Array.from(keys).every((key) =>
    templateEditorValuesEqual(leftRecord[key], rightRecord[key]),
  );
};

export type PostSaveFormState = {
  defaults: TemplateEditorFormValues;
  values: TemplateEditorFormValues;
  keptEdits: boolean;
};

export const resolvePostSaveFormState = ({
  submitted,
  current,
  saved,
}: {
  submitted: TemplateEditorFormValues;
  current: TemplateEditorFormValues;
  saved: TemplateEditorFormValues;
}): PostSaveFormState => {
  const values: Record<string, unknown> = { ...saved };
  const currentRecord = current as Record<string, unknown>;
  const submittedRecord = submitted as Record<string, unknown>;
  let keptEdits = false;

  for (const key of Object.keys(currentRecord)) {
    if (!templateEditorValuesEqual(currentRecord[key], submittedRecord[key])) {
      values[key] = currentRecord[key];
      keptEdits = true;
    }
  }

  return {
    defaults: saved,
    values: keptEdits ? (values as TemplateEditorFormValues) : saved,
    keptEdits,
  };
};

type TemplateEditorForm = Pick<
  UseFormReturn<TemplateEditorFormValues>,
  "getValues" | "reset"
>;

export const rebaseTemplateEditorFormAfterSave = (
  form: TemplateEditorForm,
  { submitted, saved }: { submitted: TemplateEditorFormValues; saved: TemplateEditorFormValues },
): PostSaveFormState => {
  const state = resolvePostSaveFormState({
    submitted,
    current: cloneTemplateEditorFormValues(form.getValues()),
    saved,
  });

  form.reset(state.defaults);
  if (state.keptEdits) {
    form.reset(state.values, { keepDefaultValues: true });
  }

  return state;
};
