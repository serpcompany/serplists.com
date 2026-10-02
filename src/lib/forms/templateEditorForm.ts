import { z } from "zod";

import type { ChecklistTemplate } from "@/types/checklist";
import { hasCurrentFileInfo, mediaSourceTypeFor } from "@/lib/utils/mediaSource";
import {
  isContentRecord,
  isSectionRecord,
  isSubTaskRecord,
  isTaskRecord,
  type ContentRecord,
  type SectionRecord,
  type SubTaskRecord,
  type TaskRecord,
} from "@/lib/schemas/jsonRecords";
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

const TEMPLATE_EDITOR_CONTENT_TYPES = templateEditorContentSchema.shape.type.options;

const toEditorText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  return (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean"
    ? String(value)
    : "";
};

const toEditorId = (value: unknown, prefix: string): string => {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : createTemplateEditorId(prefix);
};

const MEDIA_CONTENT_TYPES = new Set<TemplateEditorContentType>(["file", "image", "video"]);

const toEditorContentType = (value: unknown): TemplateEditorContentType =>
  TEMPLATE_EDITOR_CONTENT_TYPES.find((type) => type === value) ?? "text";

function normalizeTemplateEditorSubItem(raw: unknown): TemplateEditorSubItem {
  const subItem: SubTaskRecord = isSubTaskRecord(raw) ? raw : { title: raw };
  return {
    id: toEditorId(subItem.id, "subitem"),
    isCompleted: typeof subItem.isCompleted === "boolean" ? subItem.isCompleted : undefined,
    title: toEditorText(subItem.title),
  };
}

function normalizeTemplateEditorContent(
  raw: unknown,
  usedContentIds: Set<string>,
): TemplateEditorContent {
  const content: ContentRecord = isContentRecord(raw) ? raw : { value: raw };
  const type = toEditorContentType(content.type);
  let id = toEditorId(content.id, "content");
  if (usedContentIds.has(id)) {
    id = createTemplateEditorId("content");
  }
  usedContentIds.add(id);

  const fileSize = content.fileSize;
  const value = toEditorText(content.value);
  const storedUploadType =
    content.uploadType === "upload" || content.uploadType === "url" ? content.uploadType : undefined;
  const staleFileInfo =
    MEDIA_CONTENT_TYPES.has(type) && !hasCurrentFileInfo({ value, uploadType: storedUploadType });
  return {
    fileName: typeof content.fileName === "string" && !staleFileInfo ? content.fileName : undefined,
    fileSize:
      typeof fileSize === "number" && Number.isFinite(fileSize) && fileSize >= 0 && !staleFileInfo
        ? fileSize
        : undefined,
    id,
    subItems:
      type !== "subItems"
        ? undefined
        : Array.isArray(content.subItems)
          ? content.subItems.map(normalizeTemplateEditorSubItem)
          : [createTemplateEditorSubItem()],
    type,
    uploadType:
      storedUploadType === "upload" && staleFileInfo ? mediaSourceTypeFor(value) : storedUploadType,
    value,
  };
}

function normalizeTemplateEditorItem(
  raw: unknown,
  usedContentIds: Set<string>,
): TemplateEditorItem {
  const item: TaskRecord = isTaskRecord(raw) ? raw : { title: raw };
  const contents = Array.isArray(item.contents) ? item.contents : [];
  return {
    contents: contents
      .filter((content) => content !== null && content !== undefined)
      .map((content) => normalizeTemplateEditorContent(content, usedContentIds)),
    description: toEditorText(item.description),
    id: toEditorId(item.id, "item"),
    isCompleted: typeof item.isCompleted === "boolean" ? item.isCompleted : undefined,
    title: toEditorText(item.title),
  };
}

function normalizeTemplateEditorSection(
  raw: unknown,
  usedContentIds: Set<string>,
): TemplateEditorSection {
  const section: SectionRecord = isSectionRecord(raw) ? raw : {};
  const items = Array.isArray(section.items) ? section.items : [];
  return {
    id: toEditorId(section.id, "section"),
    items: items.map((item) => normalizeTemplateEditorItem(item, usedContentIds)),
    title: toEditorText(section.title),
  };
}

function buildTemplateEditorSections(sections?: unknown): TemplateEditorSection[] {
  if (Array.isArray(sections) && sections.length > 0) {
    const usedContentIds = new Set<string>();
    return sections.map((section) => normalizeTemplateEditorSection(section, usedContentIds));
  }

  return [createTemplateEditorSection()];
}

export type TemplateEditorFormSource = Omit<Partial<ChecklistTemplate>, "sections"> & {
  sections?: unknown;
};

export function buildTemplateEditorFormValues(
  template: TemplateEditorFormSource = {},
): TemplateEditorFormValues {
  const { sections, ...details } = template;
  return {
    ...buildTemplateEditorDetailsFormValues(details),
    sections: buildTemplateEditorSections(sections),
  };
}

export function normalizeTemplateEditorFormForSave(
  values: TemplateEditorFormValues,
  options: { storedSlug?: string | undefined } = {},
): TemplateEditorFormValues {
  const normalizedDetails: TemplateEditorDetailsFormValues =
    normalizeTemplateEditorDetailsForSave(values, options);

  return {
    ...normalizedDetails,
    sections: values.sections,
  };
}

export function validateTemplateEditorFormForSave(
  values: TemplateEditorFormValues,
): Array<{ type: "validation"; message: string }> {
  const result = templateEditorDetailsSchema.safeParse(values);
  if (result.success) {
    return [];
  }

  const messages = new Set(result.error.issues.map((issue) => issue.message));
  return Array.from(messages, (message) => ({ type: "validation" as const, message }));
}
