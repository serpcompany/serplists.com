import type { JSX } from "react";
import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Trash2 } from "lucide-react";

import { FormFieldOptionsEditor } from "@/components/template-editor/content-types/FormFieldOptionsEditor";
import { ReorderMoveButtons } from "@/components/template-editor/ReorderHandle";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createTemplateEditorFormOption,
  type TemplateEditorFormValues,
} from "@/lib/forms/templateEditorForm";
import {
  FORM_FIELD_KIND_LABELS,
  MAX_FORM_DESCRIPTION_LENGTH,
  MAX_FORM_LABEL_LENGTH,
  isFormChoiceKind,
  isFormFieldKind,
  type FormFieldKind,
} from "@/lib/schemas/formFields";

type FormFieldPath = `sections.${number}.items.${number}.contents.${number}.fields.${number}`;

interface FormFieldEditorProps {
  count: number;
  fieldIndex: number;
  onMove: (fromIndex: number, toIndex: number) => void;
  onMoved: (announcement: string) => void;
  onRemove: () => void;
  path: FormFieldPath;
  stableId: string;
}

const toBound = (value: string): number | undefined => {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function FormFieldEditor({
  count,
  fieldIndex,
  onMove,
  onMoved,
  onRemove,
  path,
  stableId,
}: FormFieldEditorProps): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TemplateEditorFormValues>();
  const field = useWatch({ control, name: path });
  const baseId = useId();
  const number = fieldIndex + 1;
  const name = `field ${number}`;
  const ids = {
    description: `${baseId}-description`,
    kind: `${baseId}-kind`,
    label: `${baseId}-label`,
    max: `${baseId}-max`,
    min: `${baseId}-min`,
    required: `${baseId}-required`,
  };
  const kind = field?.kind ?? "text";

  function changeKind(next: FormFieldKind): void {
    const options = getValues(`${path}.options`);
    setValue(`${path}.kind`, next, { shouldDirty: true });
    setValue(
      `${path}.options`,
      isFormChoiceKind(next) ? (options?.length ? options : [createTemplateEditorFormOption()]) : undefined,
      { shouldDirty: true },
    );
    if (next !== "number") {
      setValue(`${path}.min`, undefined, { shouldDirty: true });
      setValue(`${path}.max`, undefined, { shouldDirty: true });
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center gap-1">
        <p className="flex-1 text-sm font-medium">Field {number}</p>
        <ReorderMoveButtons
          buttonClassName="pointer-fine:inline-flex"
          count={count}
          handleId={`form-field:${stableId}`}
          index={fieldIndex}
          label={name}
          onMove={onMove}
          onMoved={onMoved}
        />
        <Button
          aria-label={`Remove ${name}`}
          className="text-muted-foreground hover:text-destructive"
          disabled={count === 1}
          onClick={onRemove}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Trash2 />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={ids.label}>
            <span className="sr-only">Field {number} </span>Label
          </FieldLabel>
          <Input
            id={ids.label}
            maxLength={MAX_FORM_LABEL_LENGTH}
            onChange={(event) => setValue(`${path}.label`, event.target.value, { shouldDirty: true })}
            value={field?.label ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.kind}>
            <span className="sr-only">Field {number} </span>Type
          </FieldLabel>
          <Select
            items={FORM_FIELD_KIND_LABELS}
            onValueChange={(value) => {
              if (isFormFieldKind(value)) changeKind(value);
            }}
            value={kind}
          >
            <SelectTrigger className="w-full" id={ids.kind}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FORM_FIELD_KIND_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={ids.description}>
          <span className="sr-only">Field {number} </span>Help text
        </FieldLabel>
        <Textarea
          id={ids.description}
          maxLength={MAX_FORM_DESCRIPTION_LENGTH}
          onChange={(event) => setValue(`${path}.description`, event.target.value, { shouldDirty: true })}
          rows={2}
          value={field?.description ?? ""}
        />
      </Field>
      {isFormChoiceKind(kind) ? <FormFieldOptionsEditor fieldNumber={number} path={path} /> : null}
      {kind === "number" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor={ids.min}>
              <span className="sr-only">Field {number} </span>Minimum
            </FieldLabel>
            <Input
              id={ids.min}
              inputMode="decimal"
              onChange={(event) => setValue(`${path}.min`, toBound(event.target.value), { shouldDirty: true })}
              step="any"
              type="number"
              value={field?.min ?? ""}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.max}>
              <span className="sr-only">Field {number} </span>Maximum
            </FieldLabel>
            <Input
              id={ids.max}
              inputMode="decimal"
              onChange={(event) => setValue(`${path}.max`, toBound(event.target.value), { shouldDirty: true })}
              step="any"
              type="number"
              value={field?.max ?? ""}
            />
          </Field>
        </div>
      ) : null}
      <Field orientation="horizontal">
        <Switch
          checked={field?.required === true}
          id={ids.required}
          nativeButton
          onCheckedChange={(checked) => setValue(`${path}.required`, checked, { shouldDirty: true })}
          render={<button type="button" />}
        />
        <FieldLabel htmlFor={ids.required}>
          <span className="sr-only">Field {number} </span>Required
        </FieldLabel>
      </Field>
    </li>
  );
}
