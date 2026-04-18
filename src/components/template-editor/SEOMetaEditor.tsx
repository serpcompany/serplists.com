import { useFormContext, useWatch } from "react-hook-form";

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateEditorDetailsFormValues } from "@/lib/forms/templateEditorDetailsForm";

interface SEOMetaEditorProps {
  showIntro?: boolean;
}

export const SEOMetaEditor = ({
  showIntro = true,
}: SEOMetaEditorProps): JSX.Element => {
  const { control } = useFormContext<TemplateEditorDetailsFormValues>();
  const seoTitle = useWatch({ control, name: "seoTitle" });
  const seoUrl = useWatch({ control, name: "seoUrl" });
  const seoDescription = useWatch({ control, name: "seoDescription" });
  const title = useWatch({ control, name: "title" });
  const description = useWatch({ control, name: "description" });

  const resolvedTitle = seoTitle || title || "Untitled Template";
  const resolvedUrl = seoUrl || "untitled";
  const resolvedDescription =
    seoDescription || description || "No description provided";

  return (
    <div className="space-y-6">
      {showIntro ? (
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Search &amp; SEO</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Configure how this template appears in search results and public listings.
          </p>
        </div>
      ) : null}

      <div className="space-y-8">
        <FormField
          control={control}
          name="seoTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">Search Title</FormLabel>
              <FormControl>
                <Input
                  placeholder="Title for search results..."
                  className="mt-2 h-11 bg-input"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Leave blank to use the template name.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="seoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">URL Slug</FormLabel>
              <FormControl>
                <Input
                  placeholder="my-template-slug"
                  className="mt-2 h-11 bg-input font-mono text-sm"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                The URL-friendly identifier for this template.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="seoDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium">
                Search Description
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Description shown in search results..."
                  rows={3}
                  className="mt-2 resize-none bg-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Preview</h3>
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-400">{resolvedTitle}</p>
            <p className="text-xs text-muted-foreground">
              example.com/templates/{resolvedUrl}
            </p>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {resolvedDescription}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
