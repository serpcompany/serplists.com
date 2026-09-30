import type { JSX } from "react";
import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

interface SectionEditorProps {
  sectionIndex: number;
  showIntro?: boolean;
}

export function SectionEditor({
  sectionIndex,
  showIntro = true,
}: SectionEditorProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const titleInputId = useId();
  const section = useWatch({
    control,
    name: `sections.${sectionIndex}` as const,
  });

  return (
    <div className="flex flex-col gap-8">
      {showIntro ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Section Settings
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sections group related tasks together.
          </p>
        </div>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={titleInputId}>Section Title</FieldLabel>
          <Input
            id={titleInputId}
            value={section?.title ?? ""}
            onChange={(event) =>
              setValue(`sections.${sectionIndex}.title`, event.target.value, {
                shouldDirty: true,
              })
            }
            placeholder="Enter section title..."
          />
        </Field>
      </FieldGroup>

      <div className="flex items-center justify-between rounded-lg border p-4 text-sm">
        <span className="text-muted-foreground">Tasks in section</span>
        <span className="font-medium">{section?.items.length ?? 0}</span>
      </div>
    </div>
  );
}
