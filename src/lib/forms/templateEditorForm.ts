import { z } from "zod";

import type {
  ChecklistItem,
  ChecklistItemContent,
  ChecklistSection,
  ChecklistSubItem,
  ChecklistTemplate,
} from "@/types/checklist";
import {
  buildTemplateEditorDetailsFormValues,
  normalizeTemplateEditorDetailsForSave,
  templateEditorDetailsSchema,
  type TemplateEditorDetailsFormValues,
} from "@/lib/forms/templateEditorDetailsForm";

const templateEditorSubItemSchema = z.object({
  id: z.string(),
  isCompleted: z.boolean().optional(),
  title: z.string(),
});

const templateEditorContentSchema = z.object({
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  id: z.string(),
  subItems: z.array(templateEditorSubItemSchema).optional(),
  type: z.enum(["embed", "file", "image", "subItems", "text", "video"]),
  uploadType: z.enum(["upload", "url"]).optional(),
  value: z.string(),
});

const templateEditorItemSchema = z.object({
  contents: z.array(templateEditorContentSchema).optional(),
  description: z.string().optional(),
  id: z.string(),
  isCompleted: z.boolean().optional(),
  title: z.string(),
});

const templateEditorSectionSchema = z.object({
  id: z.string(),
  items: z.array(templateEditorItemSchema),
  title: z.string(),
});

export const templateEditorFormSchema = templateEditorDetailsSchema.extend({
  sections: z.array(templateEditorSectionSchema),
});

export type TemplateEditorFormValues = z.infer<typeof templateEditorFormSchema>;
export type TemplateEditorContentType = ChecklistItemContent["type"];

function createTemplateEditorId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function createTemplateEditorSubItem(): ChecklistSubItem {
  return {
    id: createTemplateEditorId("subitem"),
    title: "",
  };
}

export function createTemplateEditorContent(
  type: TemplateEditorContentType,
): ChecklistItemContent {
  if (type === "subItems") {
    return {
      id: createTemplateEditorId("content"),
      subItems: [createTemplateEditorSubItem()],
      type,
      value: "",
    };
  }

  return {
    id: createTemplateEditorId("content"),
    type,
    value: "",
  };
}

export function createTemplateEditorItem(): ChecklistItem {
  return {
    contents: [],
    description: "",
    id: createTemplateEditorId("item"),
    title: "",
  };
}

export function createTemplateEditorSection(): ChecklistSection {
  return {
    id: createTemplateEditorId("section"),
    items: [],
    title: "",
  };
}

function normalizeTemplateEditorSubItem(
  subItem: Partial<ChecklistSubItem>,
): ChecklistSubItem {
  return {
    id: subItem.id ?? createTemplateEditorId("subitem"),
    isCompleted: subItem.isCompleted,
    title: subItem.title ?? "",
  };
}

function normalizeTemplateEditorContent(
  content: Partial<ChecklistItemContent>,
): ChecklistItemContent {
  const type: TemplateEditorContentType = content.type ?? "text";
  const subItems =
    type === "subItems"
      ? (content.subItems?.map(normalizeTemplateEditorSubItem) ?? [
          createTemplateEditorSubItem(),
        ])
      : content.subItems;

  return {
    fileName: content.fileName,
    fileSize: content.fileSize,
    id: content.id ?? createTemplateEditorId("content"),
    subItems,
    type,
    uploadType: content.uploadType,
    value: content.value ?? "",
  };
}

function normalizeTemplateEditorItem(item: Partial<ChecklistItem>): ChecklistItem {
  return {
    contents: (item.contents ?? []).map(normalizeTemplateEditorContent),
    description: item.description ?? "",
    id: item.id ?? createTemplateEditorId("item"),
    isCompleted: item.isCompleted,
    title: item.title ?? "",
  };
}

function normalizeTemplateEditorSection(
  section: Partial<ChecklistSection>,
): ChecklistSection {
  return {
    id: section.id ?? createTemplateEditorId("section"),
    items: (section.items ?? []).map(normalizeTemplateEditorItem),
    title: section.title ?? "",
  };
}

function buildTemplateEditorSections(
  sections?: ChecklistSection[],
): ChecklistSection[] {
  if (sections?.length) {
    return sections.map(normalizeTemplateEditorSection);
  }

  return [createTemplateEditorSection()];
}

export function buildTemplateEditorFormValues(
  template?: Partial<ChecklistTemplate>,
): TemplateEditorFormValues {
  return {
    ...buildTemplateEditorDetailsFormValues(template),
    sections: buildTemplateEditorSections(template?.sections),
  };
}

export function normalizeTemplateEditorFormForSave(
  values: TemplateEditorFormValues,
): TemplateEditorFormValues {
  const normalizedDetails: TemplateEditorDetailsFormValues =
    normalizeTemplateEditorDetailsForSave(values);

  return {
    ...normalizedDetails,
    sections: values.sections,
  };
}
