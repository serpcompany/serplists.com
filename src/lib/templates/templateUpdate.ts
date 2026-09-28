import type { TemplateUpdateResponse } from "@/lib/api";
import type { TemplateSavePayload } from "@/types/checklist";

/** The PUT /api/templates/:id body for an editor save. */
export const buildTemplateUpdateRequest = (template: TemplateSavePayload) => ({
  title: template.title,
  description: template.description,
  type: template.type,
  seoTitle: template.seoTitle,
  seoDescription: template.seoDescription,
  rules: template.rules,
  sections: template.sections,
  categories: template.categories,
  tags: template.tags,
  is_public: template.isPublic,
  slug: template.seoUrl?.trim() || template.slug?.trim() || undefined,
  expected_version: template.version,
});

/**
 * What to tell the user after a save, and whether run lists changed. Metadata-only saves
 * leave runs untouched, so only a structure change refreshes runs or mentions them.
 */
export const describeTemplateUpdate = (
  result: TemplateUpdateResponse | undefined,
): { message: string; invalidateRuns: boolean } => {
  const structureChanged = result?.structureChanged === true;
  const reconciledRuns = result?.reconciledRuns ?? 0;

  return {
    invalidateRuns: structureChanged,
    message:
      structureChanged && reconciledRuns > 0
        ? "Template updated. Checklist changes were reconciled into active private runs."
        : "Template updated.",
  };
};
