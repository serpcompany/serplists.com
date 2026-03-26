import { z } from "zod";

import type { ChecklistTemplate } from "@/types/checklist";

export const TEMPLATE_EDITOR_TYPES = ["checklist", "recipe"] as const;

const normalizeStringList = (values: string[]): string[] => {
  const seen = new Set<string>();

  return values.reduce<string[]>((result, value) => {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      return result;
    }

    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
};

export const templateEditorDetailsSchema = z.object({
  title: z.string(),
  description: z.string(),
  templateType: z.enum(TEMPLATE_EDITOR_TYPES),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  isPublic: z.boolean(),
  seoTitle: z.string(),
  seoDescription: z.string(),
  seoUrl: z.string(),
});

export type TemplateEditorDetailsFormValues = z.infer<
  typeof templateEditorDetailsSchema
>;

export const buildTemplateEditorDetailsFormValues = (
  template?: Partial<ChecklistTemplate>,
): TemplateEditorDetailsFormValues => ({
  title: template?.title ?? "",
  description: template?.description ?? "",
  templateType: template?.type === "recipe" ? "recipe" : "checklist",
  categories: template?.categories ?? [],
  tags: template?.tags ?? [],
  isPublic: template?.isPublic ?? true,
  seoTitle: template?.seoTitle ?? "",
  seoDescription: template?.seoDescription ?? "",
  seoUrl: template?.seoUrl ?? template?.slug ?? "",
});

export const normalizeTemplateEditorDetailsForSave = (
  values: TemplateEditorDetailsFormValues,
): TemplateEditorDetailsFormValues => ({
  title: values.title.trim(),
  description: values.description.trim(),
  templateType: values.templateType,
  categories: normalizeStringList(values.categories),
  tags: normalizeStringList(values.tags),
  isPublic: values.isPublic,
  seoTitle: values.seoTitle.trim(),
  seoDescription: values.seoDescription.trim(),
  seoUrl: values.seoUrl.trim(),
});
