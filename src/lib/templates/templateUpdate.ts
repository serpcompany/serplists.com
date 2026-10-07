import type { TemplateUpdateResult } from "@/lib/templateUpdateResult";
import type { TemplateSavePayload } from "@/types/checklist";

export const buildTemplateUpdateRequest = (template: TemplateSavePayload) => ({
  title: template.title,
  description: template.description,
  type: template.type,
  seoTitle: template.seoTitle,
  seoDescription: template.seoDescription,
  rules: template.rules,
  requiredTools: template.requiredTools,
  sections: template.sections,
  categories: template.categories,
  tags: template.tags,
  is_public: template.isPublic,
  slug: template.seoUrl?.trim() || template.slug?.trim() || undefined,
  expected_version: template.version,
});

export const describeTemplateUpdate = (
  result: Pick<TemplateUpdateResult, "structureChanged" | "reconciledRuns"> | undefined,
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
