import { useFormContext } from "react-hook-form";

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

export const SEOMetaEditor = (): JSX.Element => {
  const { control } = useFormContext<TemplateEditorDetailsFormValues>();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Search preview</h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Keep this tight. These fields shape how the template reads in search, shared links,
          and public library previews.
        </p>
      </div>

      <section className="rounded-lg border border-border/80 bg-card px-5 py-5">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Search preview
          </p>
          <h4 className="mt-2 text-base font-semibold text-foreground">
            Control the title, slug, and description shown outside the editor.
          </h4>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField
            control={control}
            name="seoTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Search title</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Technical SEO audit SOP"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Keep it readable first. Only optimize after the wording is clear.
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
                <FormLabel className="text-sm font-medium">
                  URL slug
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="technical-seo-audit-sop"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Short, stable, and predictable beats clever.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="seoDescription"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel className="text-sm font-medium">
                  Search description
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Explain what the SOP covers and who it helps."
                    rows={4}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Write one compact summary that will still make sense when copied into a search or social preview.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </section>
    </div>
  );
};
