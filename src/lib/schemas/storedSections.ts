import { z } from "zod";

import {
  contentRecordsIn,
  isContentRecord,
  isSectionRecord,
  formFieldRecordsIn,
  subTaskRecordsIn,
  taskRecordsIn,
  type ContentRecord,
  type FormFieldRecord,
  type JsonRecord,
  type SectionRecord,
  type SubTaskRecord,
  type TaskRecord,
} from "./jsonRecords";
import { sanitizeStoredFormFields, storedFormFieldSchema } from "./formFields";

export const CHECKLIST_CONTENT_TYPES = ["text", "image", "video", "file", "embed", "subItems", "form"] as const;

export type ChecklistContentType = (typeof CHECKLIST_CONTENT_TYPES)[number];

const text = z.string().nullish();
const flag = z.boolean().nullish();
const subItemSchema = z.object({ title: text, isCompleted: flag, completed: flag }).passthrough();
const contentSchema = z.object({
  type: z.enum(CHECKLIST_CONTENT_TYPES),
  value: text,
  uploadType: text,
  fileName: text,
  fileSize: z.number().nullish(),
  subItems: z.array(subItemSchema).nullish(),
  fields: z.array(storedFormFieldSchema).nullish(),
}).passthrough();
const itemSchema = z.object({
  title: text,
  description: text,
  notes: text,
  isCompleted: flag,
  completed: flag,
  contents: z.array(contentSchema).nullish(),
  subItems: z.array(subItemSchema).nullish(),
}).passthrough();
const sectionSchema = z.object({ title: text, items: z.array(itemSchema).nullish() }).passthrough();

const storedSectionsSchema = z.array(sectionSchema);

export function findStoredSectionsIssue(sections: unknown): string | null {
  const result = storedSectionsSchema.safeParse(sections);
  if (result.success) return null;
  const [issue] = result.error.issues;
  if (!issue) return "sections: Invalid input";
  const path = issue.path.map((part) => (typeof part === "number" ? `[${part}]` : `.${part}`)).join("");
  return `sections${path}: ${issue.message}`;
}

export const isSectionedList = (values: readonly unknown[]): boolean => {
  const [first] = values;
  return isSectionRecord(first) && first.items !== undefined;
};

const contentTypes = new Set<unknown>(CHECKLIST_CONTENT_TYPES);

export const isKnownContent = (content: unknown): content is ContentRecord =>
  isContentRecord(content) && contentTypes.has(content.type);

function withoutKeys(record: JsonRecord, keep: (key: string, value: unknown) => boolean): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => keep(key, value)));
}

const isTextOrAbsent = (value: unknown) => value === undefined || value === null || typeof value === "string";

function sanitizeStoredSubItems(value: unknown): SubTaskRecord[] {
  return subTaskRecordsIn(value).map((subItem) => {
    const { completed, ...rest } = subItem;
    return {
      ...rest,
      title: typeof subItem.title === "string" ? subItem.title : "",
      isCompleted: typeof subItem.isCompleted === "boolean" ? subItem.isCompleted : completed === true,
    };
  });
}

export const isSubTasksBlock = (content: unknown): content is ContentRecord =>
  isContentRecord(content) && content.type === "subItems";

export function getTaskSubTasks(task: TaskRecord): SubTaskRecord[] {
  return contentRecordsIn(task.contents).filter(isSubTasksBlock).flatMap((content) => subTaskRecordsIn(content.subItems));
}

export const isFormBlock = (content: unknown): content is ContentRecord =>
  isContentRecord(content) && content.type === "form";

export function getTaskFormFields(task: TaskRecord): FormFieldRecord[] {
  return contentRecordsIn(task.contents).filter(isFormBlock).flatMap((content) => formFieldRecordsIn(content.fields));
}

function sanitizeStoredContents(value: unknown): ContentRecord[] {
  return contentRecordsIn(value)
    .filter(isKnownContent)
    .map((content) => {
      const next: ContentRecord = withoutKeys(content, (key, entry) =>
        key === "fileSize" ? entry === undefined || entry === null || typeof entry === "number"
          : key === "uploadType" || key === "fileName" ? isTextOrAbsent(entry)
            : true);
      next.value = typeof content.value === "string" ? content.value : "";
      if (content.type === "subItems") next.subItems = sanitizeStoredSubItems(content.subItems);
      else delete next.subItems;
      if (content.type === "form") next.fields = sanitizeStoredFormFields(content.fields);
      else delete next.fields;
      return next;
    });
}

export function sanitizeStoredItem(item: TaskRecord): TaskRecord {
  const next: TaskRecord = withoutKeys(item, (key, entry) =>
    key === "description" || key === "notes" ? isTextOrAbsent(entry) : true);
  if (!isTextOrAbsent(item.title)) next.title = "";
  if (item.contents !== undefined) next.contents = sanitizeStoredContents(item.contents);
  if (item.subItems !== undefined) next.subItems = sanitizeStoredSubItems(item.subItems);
  return next;
}

export function sanitizeStoredSections(sections: unknown[]): SectionRecord[] {
  return sections.filter(isSectionRecord).map((section) => {
    const next: SectionRecord = { ...section };
    if (!isTextOrAbsent(section.title)) next.title = "";
    if (section.items !== undefined) next.items = taskRecordsIn(section.items).map(sanitizeStoredItem);
    return next;
  });
}
