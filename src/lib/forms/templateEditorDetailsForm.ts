import { z } from "zod";

import {
  slugifyTemplateSlug,
  TEMPLATE_FIELD_LIMITS as LIMITS,
} from "@/lib/schemas/templateFields";
import { uniqueCategoryNames } from "@/lib/categorySlug";
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

const maxLength = (label: string, max: number) =>
  z.string().max(max, `${label} must be ${max} characters or fewer.`);

const boundedList = (label: string) =>
  z
    .array(
      z
        .string()
        .max(
          LIMITS.tagOrCategoryLength,
          `${label}: each must be ${LIMITS.tagOrCategoryLength} characters or fewer.`,
        ),
    )
    .max(LIMITS.tagOrCategoryCount, `${label}: use ${LIMITS.tagOrCategoryCount} or fewer.`);

export const templateEditorDetailsSchema = z.object({
  title: maxLength("Template name", LIMITS.title),
  description: maxLength("Goal / summary", LIMITS.description),
  templateType: z.enum(TEMPLATE_EDITOR_TYPES),
  categories: boundedList("Categories"),
  tags: boundedList("Tags"),
  isPublic: z.boolean(),
  seoTitle: maxLength("Search title", LIMITS.seoTitle),
  seoDescription: maxLength("Search description", LIMITS.seoDescription),
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

export const normalizeTemplateEditorSlugForSave = (
  seoUrl: string,
  storedSlug?: string,
): string => {
  const typed = seoUrl.trim();
  return storedSlug && typed === storedSlug ? storedSlug : slugifyTemplateSlug(typed) || typed;
};

export const TEMPLATE_SLUG_UNUSABLE_MESSAGE = "URL Slug: use Latin letters or numbers.";

export const findTemplateEditorSlugIssue = (
  seoUrl: string,
  storedSlug?: string,
): string | null => {
  const typed = seoUrl.trim();
  if (!typed || (storedSlug && typed === storedSlug)) return null;
  return slugifyTemplateSlug(typed) ? null : TEMPLATE_SLUG_UNUSABLE_MESSAGE;
};

export const normalizeTemplateEditorDetailsForSave = (
  values: TemplateEditorDetailsFormValues,
  options: { storedSlug?: string } = {},
): TemplateEditorDetailsFormValues => ({
  title: values.title.trim(),
  description: values.description.trim(),
  templateType: values.templateType,
  categories: uniqueCategoryNames(values.categories),
  tags: normalizeStringList(values.tags),
  isPublic: values.isPublic,
  seoTitle: values.seoTitle.trim(),
  seoDescription: values.seoDescription.trim(),
  seoUrl: normalizeTemplateEditorSlugForSave(values.seoUrl, options.storedSlug),
});
