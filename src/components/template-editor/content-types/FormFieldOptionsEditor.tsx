import type { JSX } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  createTemplateEditorFormOption,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import { MAX_FORM_FIELD_OPTIONS, MAX_FORM_LABEL_LENGTH } from "@/lib/schemas/formFields";

interface FormFieldOptionsEditorProps {
  fieldNumber: number;
  path: `sections.${number}.items.${number}.contents.${number}.fields.${number}`;
}

export function FormFieldOptionsEditor({ fieldNumber, path }: FormFieldOptionsEditorProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const { append, fields, remove } = useFieldArray({ control, keyName: "fieldId", name: `${path}.options` });
  const options = useWatch({ control, name: `${path}.options` }) ?? [];
  const atLimit = fields.length >= MAX_FORM_FIELD_OPTIONS;

  return (
    <FieldSet className="gap-2">
      <FieldLegend className="mb-0" variant="label">
        <span className="sr-only">Field {fieldNumber} </span>Options
      </FieldLegend>
      {fields.map((optionField, optionIndex) => {
        const optionName = `Field ${fieldNumber} option ${optionIndex + 1}`;
        return (
          <div className="flex items-center gap-2" key={optionField.fieldId}>
            <Input
              aria-label={optionName}
              className="grow"
              maxLength={MAX_FORM_LABEL_LENGTH}
              onChange={(event) =>
                setValue(`${path}.options.${optionIndex}.label`, event.target.value, { shouldDirty: true })
              }
              placeholder={`Option ${optionIndex + 1}`}
              value={options[optionIndex]?.label ?? ""}
            />
            <Button
              aria-label={`Remove ${optionName.toLowerCase()}`}
              disabled={fields.length === 1}
              onClick={() => remove(optionIndex)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 />
            </Button>
          </div>
        );
      })}
      <Button
        className="w-full sm:w-fit"
        disabled={atLimit}
        onClick={() => append(createTemplateEditorFormOption())}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus data-icon="inline-start" />
        Add option
      </Button>
      {atLimit ? <FieldDescription>A field can have up to {MAX_FORM_FIELD_OPTIONS} options.</FieldDescription> : null}
    </FieldSet>
  );
}
