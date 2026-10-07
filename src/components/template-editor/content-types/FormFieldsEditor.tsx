import type { JSX } from "react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";
import { ClipboardList, Plus } from "lucide-react";

import { FormFieldEditor } from "@/components/template-editor/content-types/FormFieldEditor";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  createTemplateEditorFormField,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { MAX_FORM_FIELDS } from "@/lib/schemas/formFields";

interface FormFieldsEditorProps {
  contentIndex: number;
  itemIndex: number;
  sectionIndex: number;
}

export function FormFieldsEditor({ contentIndex, itemIndex, sectionIndex }: FormFieldsEditorProps): JSX.Element {
  const { control } = useFormContext<TemplateEditorFormValues>();
  const { append, fields, move, remove } = useFieldArray({
    control,
    keyName: "fieldId",
    name: `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}.fields` as const,
  });
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  const atLimit = fields.length >= MAX_FORM_FIELDS;

  return (
    <FieldSet className="gap-3">
      <FieldLegend className="mb-0 flex items-center gap-2" variant="label">
        <ClipboardList className="size-4" /> Form fields
      </FieldLegend>
      <ul className="flex flex-col gap-3">
        {fields.map((formField, fieldIndex) => (
          <FormFieldEditor
            count={fields.length}
            fieldIndex={fieldIndex}
            key={formField.fieldId}
            onMove={move}
            onMoved={setMoveAnnouncement}
            onRemove={() => remove(fieldIndex)}
            path={`sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}.fields.${fieldIndex}`}
            stableId={formField.id}
          />
        ))}
      </ul>
      <Button
        className="w-full"
        disabled={atLimit}
        onClick={() => append(createTemplateEditorFormField())}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus data-icon="inline-start" />
        Add field
      </Button>
      {atLimit ? <FieldDescription>A form can have up to {MAX_FORM_FIELDS} fields.</FieldDescription> : null}
      <div aria-live="polite" className="sr-only" role="status">
        {moveAnnouncement}
      </div>
    </FieldSet>
  );
}
