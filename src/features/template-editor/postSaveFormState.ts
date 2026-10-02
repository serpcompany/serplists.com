import type { UseFormReturn } from "react-hook-form";

import { templateEditorFormSchema, type TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

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

  const leftFields = new Map<string, unknown>(Object.entries(left));
  const rightFields = new Map<string, unknown>(Object.entries(right));
  const keys = new Set([...leftFields.keys(), ...rightFields.keys()]);
  return Array.from(keys).every((key) =>
    templateEditorValuesEqual(leftFields.get(key), rightFields.get(key)),
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
  const values: TemplateEditorFormValues = { ...saved };
  let keptEdits = false;

  for (const field of TEMPLATE_EDITOR_FIELDS) {
    if (!templateEditorValuesEqual(current[field], submitted[field])) {
      copyField(values, current, field);
      keptEdits = true;
    }
  }

  return {
    defaults: saved,
    values: keptEdits ? values : saved,
    keptEdits,
  };
};

const TEMPLATE_EDITOR_FIELDS = templateEditorFormSchema.keyof().options;

function copyField<Field extends keyof TemplateEditorFormValues>(
  target: TemplateEditorFormValues,
  source: TemplateEditorFormValues,
  field: Field,
): void {
  target[field] = source[field];
}

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
