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
  const section = useWatch({
    control,
    name: `sections.${sectionIndex}` as const,
  });

  return (
    <div className="space-y-8">
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
          <FieldLabel>Section Title</FieldLabel>
          <Input
            value={section?.title ?? ""}
            onChange={(event) =>
              setValue(`sections.${sectionIndex}.title`, event.target.value, {
                shouldDirty: true,
              })
            }
            placeholder="Enter section title..."
            className="bg-input"
          />
        </Field>
      </FieldGroup>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Tasks in section</span>
          <span className="text-sm font-medium text-foreground">
            {section?.items.length ?? 0}
          </span>
        </div>
      </div>
    </div>
  );
}
