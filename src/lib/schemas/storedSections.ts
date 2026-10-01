import { z } from "zod";

export const CHECKLIST_CONTENT_TYPES = ["text", "image", "video", "file", "embed", "subItems"] as const;

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

export const storedSectionsSchema = z.array(sectionSchema);

export function findStoredSectionsIssue(sections: unknown): string | null {
  const result = storedSectionsSchema.safeParse(sections);
  if (result.success) return null;
  const [issue] = result.error.issues;
  if (!issue) return "sections: Invalid input";
  const path = issue.path.map((part) => (typeof part === "number" ? `[${part}]` : `.${part}`)).join("");
  return `sections${path}: ${issue.message}`;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isSectionedList = (values: readonly unknown[]): boolean =>
  isRecord(values[0]) && values[0].items !== undefined;

const records = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const contentTypes = new Set<unknown>(CHECKLIST_CONTENT_TYPES);

function withoutKeys(record: JsonRecord, keep: (key: string, value: unknown) => boolean): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => keep(key, value)));
}

const isTextOrAbsent = (value: unknown) => value === undefined || value === null || typeof value === "string";

export function sanitizeStoredSubItems(value: unknown): JsonRecord[] {
  return records(value).map((subItem) => {
    const { completed, ...rest } = subItem;
    return {
      ...rest,
      title: typeof subItem.title === "string" ? subItem.title : "",
      isCompleted: typeof subItem.isCompleted === "boolean" ? subItem.isCompleted : completed === true,
    };
  });
}

export const isSubTasksBlock = (content: unknown): content is JsonRecord =>
  isRecord(content) && content.type === "subItems";

export function getTaskSubTasks(task: JsonRecord): JsonRecord[] {
  return records(task.contents).filter(isSubTasksBlock).flatMap((content) => records(content.subItems));
}

export function sanitizeStoredContents(value: unknown): JsonRecord[] {
  return records(value)
    .filter((content) => contentTypes.has(content.type))
    .map((content) => {
      const next = withoutKeys(content, (key, entry) =>
        key === "fileSize" ? entry === undefined || entry === null || typeof entry === "number"
          : key === "uploadType" || key === "fileName" ? isTextOrAbsent(entry)
            : true);
      next.value = typeof content.value === "string" ? content.value : "";
      if (content.type === "subItems") next.subItems = sanitizeStoredSubItems(content.subItems);
      else delete next.subItems;
      return next;
    });
}

export function sanitizeStoredItem(item: JsonRecord): JsonRecord {
  const next = withoutKeys(item, (key, entry) =>
    key === "description" || key === "notes" ? isTextOrAbsent(entry) : true);
  if (!isTextOrAbsent(item.title)) next.title = "";
  if (item.contents !== undefined) next.contents = sanitizeStoredContents(item.contents);
  if (item.subItems !== undefined) next.subItems = sanitizeStoredSubItems(item.subItems);
  return next;
}

export function sanitizeStoredSections(sections: unknown[]): JsonRecord[] {
  return sections.filter(isRecord).map((section) => {
    const next: JsonRecord = { ...section };
    if (!isTextOrAbsent(section.title)) next.title = "";
    if (section.items !== undefined) next.items = records(section.items).map(sanitizeStoredItem);
    return next;
  });
}
