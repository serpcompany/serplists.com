import { useFormContext } from "react-hook-form";

import { ContentEditor } from "@/components/template-editor/ContentEditor";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

interface ItemEditorProps {
  itemIndex: number;
  sectionIndex: number;
}

export function ItemEditor({
  itemIndex,
  sectionIndex,
}: ItemEditorProps): JSX.Element {
  const { control } = useFormContext<TemplateEditorFormValues>();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Task details</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Write the task like a docs step. The title should be scannable and the
          body should explain the exact action to take.
        </p>
      </div>

      <div className="space-y-4">
        <FormField
          control={control}
          name={`sections.${sectionIndex}.items.${itemIndex}.title` as const}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base">Task Title</FormLabel>
              <FormControl>
                <Input
                  className="mt-2"
                  placeholder={`Task ${itemIndex + 1} title`}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={`sections.${sectionIndex}.items.${itemIndex}.description` as const}
          render={({ field }) => (
            <FormItem className="space-y-4">
              <FormLabel className="text-base">Description (optional)</FormLabel>
              <FormControl>
                <Textarea
                  className="mt-2"
                  placeholder="Optional description or instructions"
                  rows={4}
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <ContentEditor itemIndex={itemIndex} sectionIndex={sectionIndex} />
    </div>
  );
}
