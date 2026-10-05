import type { JSX } from "react";
import { useId } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";
import { createTemplateEditorRequiredTool } from "@/lib/forms/templateEditorRequiredTools";
import { REQUIRED_TOOL_NAME_MAX, REQUIRED_TOOL_URL_MAX, REQUIRED_TOOLS_MAX } from "@/lib/schemas/requiredTools";

export function RequiredToolsEditor(): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const { append, fields, remove } = useFieldArray({ control, keyName: "fieldId", name: "requiredTools" });
  const tools = useWatch({ control, name: "requiredTools" }) ?? [];
  const fieldId = useId();
  const descriptionId = `${fieldId}-description`;
  const atLimit = fields.length >= REQUIRED_TOOLS_MAX;

  return (
    <FieldSet aria-describedby={descriptionId} className="gap-3">
      <FieldLegend className="mb-0" variant="label">Required tools</FieldLegend>
      <FieldDescription id={descriptionId}>
        The apps or services someone needs to run this template. Each one links to its website.
      </FieldDescription>
      {fields.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {fields.map((toolField, index) => {
            const number = index + 1;
            const tool = tools[index];
            const ids = { name: `${fieldId}-${number}-name`, url: `${fieldId}-${number}-url`, required: `${fieldId}-${number}-required` };
            return (
              <li className="flex flex-col gap-3 rounded-lg border p-3" key={toolField.fieldId}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Tool {number}</p>
                  <Button aria-label={`Remove tool ${number}`} onClick={() => remove(index)} size="icon" type="button" variant="ghost">
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={ids.name}>
                      <span className="sr-only">Tool {number} </span>Name
                    </FieldLabel>
                    <Input
                      id={ids.name}
                      maxLength={REQUIRED_TOOL_NAME_MAX}
                      onChange={(event) => setValue(`requiredTools.${index}.name`, event.target.value, { shouldDirty: true })}
                      placeholder="Time tracker"
                      value={tool?.name ?? ""}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={ids.url}>
                      <span className="sr-only">Tool {number} </span>URL
                    </FieldLabel>
                    <Input
                      autoCapitalize="none"
                      autoComplete="url"
                      id={ids.url}
                      inputMode="url"
                      maxLength={REQUIRED_TOOL_URL_MAX}
                      onChange={(event) => setValue(`requiredTools.${index}.url`, event.target.value, { shouldDirty: true })}
                      placeholder="https://"
                      spellCheck={false}
                      value={tool?.url ?? ""}
                    />
                  </Field>
                </div>
                <Field orientation="horizontal">
                  <Switch
                    checked={tool?.required ?? true}
                    id={ids.required}
                    nativeButton
                    onCheckedChange={(checked) => setValue(`requiredTools.${index}.required`, checked, { shouldDirty: true })}
                    render={<button type="button" />}
                  />
                  <FieldLabel htmlFor={ids.required}>
                    <span className="sr-only">Tool {number} </span>Required
                  </FieldLabel>
                </Field>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Button
        className="w-full sm:w-fit"
        disabled={atLimit}
        onClick={() => append(createTemplateEditorRequiredTool())}
        size="sm"
        type="button"
        variant="outline"
      >
        <Plus data-icon="inline-start" />
        Add tool
      </Button>
      {atLimit ? <FieldDescription>A template can list up to {REQUIRED_TOOLS_MAX} tools.</FieldDescription> : null}
    </FieldSet>
  );
}
