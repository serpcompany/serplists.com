import type { JSX } from "react";
import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  normalizeTemplateEditorSlugForSave,
  type TemplateEditorDetailsFormValues,
} from "@/lib/forms/templateEditorDetailsForm";
import { DEFAULT_TEMPLATE_TITLE, TEMPLATE_FIELD_LIMITS } from "@/lib/schemas/templateFields";
import { buildTemplateSeoPreview } from "@/lib/templates/templateSeoPreview";

interface SEOMetaEditorProps {
  showIntro?: boolean;
  // The template owner's public profile slug (resolvePublicTemplateOwnerSlug); null when
  // the owner has no username, so the template has no public URL.
  ownerSlug?: string | null;
}

const browserOrigin = (): string | undefined =>
  typeof window !== "undefined" ? window.location.origin : undefined;

export const SEOMetaEditor = ({
  showIntro = true,
  ownerSlug = null,
}: SEOMetaEditorProps): JSX.Element => {
  const { control, formState, setValue } = useFormContext<TemplateEditorDetailsFormValues>();
  const seoTitle = useWatch({ control, name: "seoTitle" });
  const seoUrl = useWatch({ control, name: "seoUrl" });
  const seoDescription = useWatch({ control, name: "seoDescription" });
  const title = useWatch({ control, name: "title" });
  const description = useWatch({ control, name: "description" });
  const isPublic = useWatch({ control, name: "isPublic" });
  const fieldId = useId();
  const ids = {
    seoTitle: `${fieldId}-seo-title`,
    seoTitleHint: `${fieldId}-seo-title-hint`,
    seoUrl: `${fieldId}-seo-url`,
    seoUrlHint: `${fieldId}-seo-url-hint`,
    seoDescription: `${fieldId}-seo-description`,
  };

  // The slug the template has now (the form's loaded value); left unedited, it is kept.
  const storedSlug = formState.defaultValues?.seoUrl;
  const resolvedTitle = seoTitle || title || DEFAULT_TEMPLATE_TITLE;
  // The public page the template will have after a save, with the slug the save stores.
  const preview = buildTemplateSeoPreview({
    seoUrl: seoUrl || "",
    storedSlug,
    title: title || "",
    ownerSlug,
    origin: browserOrigin(),
  });

  // Show the slug that will be saved once the user leaves the field.
  const handleSlugBlur = (): void => {
    const normalized = normalizeTemplateEditorSlugForSave(seoUrl || "", storedSlug);
    if (normalized !== seoUrl) {
      setValue("seoUrl", normalized, { shouldDirty: true });
    }
  };
  const resolvedDescription =
    seoDescription || description || "No description provided";

  return (
    <div className="flex flex-col gap-8">
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
          <FieldLabel htmlFor={ids.seoTitle}>Search Title</FieldLabel>
          <Input
            id={ids.seoTitle}
            aria-describedby={ids.seoTitleHint}
            value={seoTitle || ""}
            maxLength={TEMPLATE_FIELD_LIMITS.seoTitle}
            onChange={(event) =>
              setValue("seoTitle", event.target.value, { shouldDirty: true })
            }
            placeholder="Title for search results..."
          />
          <FieldDescription id={ids.seoTitleHint}>Leave blank to use the template name</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={ids.seoUrl}>URL Slug</FieldLabel>
          <Input
            id={ids.seoUrl}
            aria-describedby={ids.seoUrlHint}
            value={seoUrl || ""}
            onChange={(event) =>
              setValue("seoUrl", event.target.value, { shouldDirty: true })
            }
            onBlur={handleSlugBlur}
            placeholder="my-template-slug"
            className="font-mono"
          />
          <FieldDescription id={ids.seoUrlHint}>The URL-friendly identifier for this template</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={ids.seoDescription}>Search Description</FieldLabel>
          <Textarea
            id={ids.seoDescription}
            value={seoDescription || ""}
            maxLength={TEMPLATE_FIELD_LIMITS.seoDescription}
            onChange={(event) =>
              setValue("seoDescription", event.target.value, { shouldDirty: true })
            }
            placeholder="Description shown in search results..."
            rows={3}
            className="resize-none"
          />
        </Field>
      </FieldGroup>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium wrap-anywhere">{resolvedTitle}</p>
            {preview.kind === "url" ? (
              <p className="text-xs break-all text-muted-foreground">{preview.url}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No public URL yet: the template owner needs a username, which they can set in
                Settings.
              </p>
            )}
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {resolvedDescription}
            </p>
          </div>
          {isPublic === false ? (
            <p className="text-xs text-muted-foreground">
              This template is private, so this page is not live. Turn on Public Template in
              Template Settings to publish it.
            </p>
          ) : null}
          {preview.kind === "url" && preview.mayGetSuffix ? (
            <p className="text-xs text-muted-foreground">
              If another template already uses this URL, a short code is added to the end
              when you save.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
