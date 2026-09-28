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
export type TemplateEditorSection = z.infer<typeof templateEditorSectionSchema>;
export type TemplateEditorItem = z.infer<typeof templateEditorItemSchema>;
export type TemplateEditorContent = z.infer<typeof templateEditorContentSchema>;
export type TemplateEditorSubItem = z.infer<typeof templateEditorSubItemSchema>;
export type TemplateEditorContentType = TemplateEditorContent["type"];

export type TemplateEditorContentPath =
  `sections.${number}.items.${number}.contents.${number}`;

// Finds a content block by its stable id in the current form values. Work that
// finishes later (an upload) must use this, not indexes captured when it started:
// blocks, tasks, and sections can move or be removed in the meantime.
export function findTemplateEditorContentPath(
  sections: TemplateEditorSection[],
  contentId: string,
): TemplateEditorContentPath | null {
  for (const [sectionIndex, section] of sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      const contentIndex = (item.contents ?? []).findIndex(
        (content) => content.id === contentId,
      );
      if (contentIndex >= 0) {
        return `sections.${sectionIndex}.items.${itemIndex}.contents.${contentIndex}`;
      }
    }
  }

  return null;
}

function createTemplateEditorId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function createTemplateEditorSubItem(): TemplateEditorSubItem {
  return {
    id: createTemplateEditorId("subitem"),
    title: "",
  };
}

export function createTemplateEditorContent(
  type: TemplateEditorContentType,
): TemplateEditorContent {
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

export function createTemplateEditorItem(): TemplateEditorItem {
  return {
    contents: [],
    description: "",
    id: createTemplateEditorId("item"),
    title: "",
  };
}

export function createTemplateEditorSection(): TemplateEditorSection {
  return {
    id: createTemplateEditorId("section"),
    items: [],
    title: "",
  };
}

function normalizeTemplateEditorSubItem(
  subItem: Partial<ChecklistSubItem>,
): TemplateEditorSubItem {
  return {
    id: subItem.id ?? createTemplateEditorId("subitem"),
    isCompleted: subItem.isCompleted,
    title: subItem.title ?? "",
  };
}

function normalizeTemplateEditorContent(
  content: Partial<ChecklistItemContent>,
): TemplateEditorContent {
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

function normalizeTemplateEditorItem(item: Partial<ChecklistItem>): TemplateEditorItem {
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
): TemplateEditorSection {
  return {
    id: section.id ?? createTemplateEditorId("section"),
    items: (section.items ?? []).map(normalizeTemplateEditorItem),
    title: section.title ?? "",
  };
}

function buildTemplateEditorSections(
  sections?: ChecklistSection[],
): TemplateEditorSection[] {
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
  options: { storedSlug?: string } = {},
): TemplateEditorFormValues {
  const normalizedDetails: TemplateEditorDetailsFormValues =
    normalizeTemplateEditorDetailsForSave(values, options);

  return {
    ...normalizedDetails,
    sections: values.sections,
  };
}

// Checks save-ready values against the editor schema, which carries the API's limits.
// Each message names the field as the editor labels it.
export function validateTemplateEditorFormForSave(
  values: TemplateEditorFormValues,
): Array<{ type: "validation"; message: string }> {
  const result = templateEditorFormSchema.safeParse(values);
  if (result.success) {
    return [];
  }

  const messages = new Set(result.error.issues.map((issue) => issue.message));
  return Array.from(messages, (message) => ({ type: "validation" as const, message }));
}
