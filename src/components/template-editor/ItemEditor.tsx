import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { ContentEditor } from "@/components/template-editor/ContentEditor";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

interface ItemEditorProps {
  itemIndex: number;
  sectionIndex: number;
  showIntro?: boolean;
}

export function ItemEditor({
  itemIndex,
  sectionIndex,
  showIntro = true,
}: ItemEditorProps): JSX.Element {
  const { control, setValue } = useFormContext<TemplateEditorFormValues>();
  const titleInputId = useId();
  const descriptionInputId = useId();
  const title = useWatch({
    control,
    name: `sections.${sectionIndex}.items.${itemIndex}.title` as const,
  });
  const description = useWatch({
    control,
    name: `sections.${sectionIndex}.items.${itemIndex}.description` as const,
  });

  return (
    <div className="space-y-8">
      {showIntro ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Task Details</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define the step and add supporting content.
          </p>
        </div>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={titleInputId}>Task Title</FieldLabel>
          <Input
            id={titleInputId}
            value={title ?? ""}
            onChange={(event) =>
              setValue(
                `sections.${sectionIndex}.items.${itemIndex}.title`,
                event.target.value,
                { shouldDirty: true },
              )
            }
            placeholder="What needs to be done..."
            className="bg-input"
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={descriptionInputId}>
            Description (Optional)
          </FieldLabel>
          <Textarea
            id={descriptionInputId}
            value={description ?? ""}
            onChange={(event) =>
              setValue(
                `sections.${sectionIndex}.items.${itemIndex}.description`,
                event.target.value,
                { shouldDirty: true },
              )
            }
            placeholder="Add more context or instructions..."
            rows={2}
            className="resize-none bg-input"
          />
        </Field>
      </FieldGroup>

      <ContentEditor itemIndex={itemIndex} sectionIndex={sectionIndex} />
    </div>
  );
}
