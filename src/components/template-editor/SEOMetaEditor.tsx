import { useFormContext, useWatch } from "react-hook-form";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateEditorDetailsFormValues } from "@/lib/forms/templateEditorDetailsForm";

interface SEOMetaEditorProps {
  showIntro?: boolean;
}

export const SEOMetaEditor = ({
  showIntro = true,
}: SEOMetaEditorProps): JSX.Element => {
  const { control, setValue } = useFormContext<TemplateEditorDetailsFormValues>();
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
    <div className="space-y-8">
      {showIntro ? (
        <div>
          <h2 className="text-lg font-semibold text-foreground">Search &amp; SEO</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure how this template appears in search results and public
            listings.
          </p>
        </div>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel>Search Title</FieldLabel>
          <Input
            value={seoTitle || ""}
            onChange={(event) =>
              setValue("seoTitle", event.target.value, { shouldDirty: true })
            }
            placeholder="Title for search results..."
            className="bg-input"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Leave blank to use the template name
          </p>
        </Field>

        <Field>
          <FieldLabel>URL Slug</FieldLabel>
          <Input
            value={seoUrl || ""}
            onChange={(event) =>
              setValue("seoUrl", event.target.value, { shouldDirty: true })
            }
            placeholder="my-template-slug"
            className="bg-input font-mono text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The URL-friendly identifier for this template
          </p>
        </Field>

        <Field>
          <FieldLabel>Search Description</FieldLabel>
          <Textarea
            value={seoDescription || ""}
            onChange={(event) =>
              setValue("seoDescription", event.target.value, { shouldDirty: true })
            }
            placeholder="Description shown in search results..."
            rows={3}
            className="resize-none bg-input"
          />
        </Field>
      </FieldGroup>

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
  );
};
