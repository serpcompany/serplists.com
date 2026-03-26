import { useFormContext, useWatch } from "react-hook-form";

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

interface SectionEditorProps {
  sectionIndex: number;
}

export function SectionEditor({
  sectionIndex,
}: SectionEditorProps): JSX.Element {
  const { control } = useFormContext<TemplateEditorFormValues>();
  const section = useWatch({
    control,
    name: `sections.${sectionIndex}` as const,
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Section details</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Keep section names short enough that the outline reads like a clean
          table of contents.
        </p>
      </div>

      <FormField
        control={control}
        name={`sections.${sectionIndex}.title` as const}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-base">Section Title (optional)</FormLabel>
            <FormControl>
              <Input
                className="mt-2"
                placeholder={`Section ${sectionIndex + 1} title (optional)`}
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
        <p className="text-sm leading-6 text-muted-foreground">
          This section contains {section?.items.length ?? 0} task
          {section?.items.length === 1 ? "" : "s"}. Select a task from the
          outline to edit its details, or add another task to keep building.
        </p>
      </div>
    </div>
  );
}
