import type { UseFormReturn } from "react-hook-form";

import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

// react-hook-form's getValues() is a shallow copy: typing into a task changes the
// nested objects in place. A save must work from a deep copy taken at click time.
export const cloneTemplateEditorFormValues = (
  values: TemplateEditorFormValues,
): TemplateEditorFormValues => structuredClone(values);

// Structural equality for form values (plain JSON-like data). A missing key and an
// undefined value count as equal, since the form sets optional fields either way.
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
  // The new baseline: what the server stored.
  defaults: TemplateEditorFormValues;
  // What the form shows: the saved values, with any field edited during the save kept.
  values: TemplateEditorFormValues;
  keptEdits: boolean;
};

// `submitted` is the click-time copy that was sent, `current` the form now, and `saved`
// the normalized values the server stored. A field that still equals what was sent
// takes the saved value (trimmed, final slug); a field edited during the save keeps
// the edit. Compare against what was sent, not `saved`, or normalization alone would
// look like an edit.
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

// After a successful save, makes the saved values the form's baseline without
// discarding edits typed while the save was in flight. With edits, the form stays
// dirty, so the unsaved-changes guards still warn about them.
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
    // keepDefaultValues makes react-hook-form recompute isDirty against `saved`.
    form.reset(state.values, { keepDefaultValues: true });
  }

  return state;
};
