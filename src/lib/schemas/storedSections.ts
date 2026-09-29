import { z } from "zod";

// Stored checklist JSON (templates.items and checklist_runs.items): sections of tasks, each
// with optional content blocks and Sub-tasks. Shared by the API, which checks every write
// against storedSectionsSchema and makes stored content safe before copying it into a run,
// and the app, which makes stored content safe before rendering it.
//
// Only the shapes readers rely on are checked: lists are arrays, text is text, and a content
// block has a known type. Ids, run state and unknown keys pass through, and null counts as
// absent, so every legacy row and run the app has stored still saves.

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

/** The first problem in `sections`, naming its path ("sections[0].items[2].contents[1].subItems: ..."), or null. */
export function findStoredSectionsIssue(sections: unknown): string | null {
  const result = storedSectionsSchema.safeParse(sections);
  if (result.success) return null;
  const issue = result.error.issues[0];
  const path = issue.path.map((part) => (typeof part === "number" ? `[${part}]` : `.${part}`)).join("");
  return `sections${path}: ${issue.message}`;
}

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Whether stored content is a list of sections rather than a legacy flat task list: its
 * first entry is an object with `items`, even `items: null`. The API's payload check and
 * identity pass both use this, and the app's isSectionsShape reads it the same way.
 */
export const isSectionedList = (values: readonly unknown[]): boolean =>
  isRecord(values[0]) && values[0].items !== undefined;

const records = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const contentTypes = new Set<unknown>(CHECKLIST_CONTENT_TYPES);

function withoutKeys(record: JsonRecord, keep: (key: string, value: unknown) => boolean): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => keep(key, value)));
}

const isTextOrAbsent = (value: unknown) => value === undefined || value === null || typeof value === "string";

/** Sub-tasks as objects with text titles and a boolean isCompleted (legacy `completed` folded in). */
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

/**
 * Content blocks safe to render and copy: entries that are not objects or have an unknown
 * type are dropped, a non-text value becomes "", and Sub-task lists are always arrays.
 */
export function sanitizeStoredContents(value: unknown): JsonRecord[] {
  return records(value)
    .filter((content) => contentTypes.has(content.type))
    .map((content) => {
      const next = withoutKeys(content, (key, entry) =>
        key === "fileSize" ? entry === undefined || entry === null || typeof entry === "number"
          : key === "uploadType" || key === "fileName" ? isTextOrAbsent(entry)
            : true);
      next.value = typeof content.value === "string" ? content.value : "";
      if (content.type === "subItems" || content.subItems !== undefined) {
        next.subItems = sanitizeStoredSubItems(content.subItems);
      }
      return next;
    });
}

/** A task safe to render and copy: text fields are text, and its lists are arrays of objects. */
export function sanitizeStoredItem(item: JsonRecord): JsonRecord {
  const next = withoutKeys(item, (key, entry) =>
    key === "description" || key === "notes" ? isTextOrAbsent(entry) : true);
  if (!isTextOrAbsent(item.title)) next.title = "";
  if (item.contents !== undefined) next.contents = sanitizeStoredContents(item.contents);
  if (item.subItems !== undefined) next.subItems = sanitizeStoredSubItems(item.subItems);
  return next;
}

/** Sections (already in the sectioned shape) that always pass storedSectionsSchema. */
export function sanitizeStoredSections(sections: unknown[]): JsonRecord[] {
  return sections.filter(isRecord).map((section) => {
    const next: JsonRecord = { ...section };
    if (!isTextOrAbsent(section.title)) next.title = "";
    if (section.items !== undefined) next.items = records(section.items).map(sanitizeStoredItem);
    return next;
  });
}
