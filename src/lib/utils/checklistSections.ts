import { z } from "zod";

import { toProgressPercent } from "@/lib/progress";
import {
  isContentRecord,
  isSectionRecord,
  isTaskRecord,
  readTextId,
  type ContentRecord,
  type JsonRecord,
  type SubTaskRecord,
  type TaskRecord,
} from "@/lib/schemas/jsonRecords";
import { readFormFields } from "@/lib/schemas/formFields";
import { CHECKLIST_CONTENT_TYPES, isSectionedList, sanitizeStoredItem } from "@/lib/schemas/storedSections";
import type { ChecklistFormField, ChecklistItemContent, ChecklistSection, ChecklistSubItem } from "@/types/checklist";

export function sectionFallbackTitle(sectionIndex: number): string {
  return `Section ${sectionIndex + 1}`;
}

const displayTitle = (title: string): string => title.trim();

export function getSectionDisplayTitle(
  section: Pick<ChecklistSection, "title">,
  sectionIndex: number,
): string {
  return displayTitle(section.title) || sectionFallbackTitle(sectionIndex);
}

export function getSubItemDisplayTitle(
  subItem: Pick<ChecklistSubItem, "title">,
  subItemIndex: number,
): string {
  return displayTitle(subItem.title) || `Sub-task ${subItemIndex + 1}`;
}

export function isSectionsShape(value: unknown): value is ChecklistSection[] {
  if (!Array.isArray(value)) return false;
  return value.length === 0 || isSectionedList(value);
}

const toTitledRecord = (value: unknown): TaskRecord | null => {
  if (typeof value === "string") {
    const title = value.trim();
    return title ? { title } : null;
  }
  return isTaskRecord(value) ? value : null;
};

const completionOf = (value: TaskRecord | SubTaskRecord): boolean =>
  typeof value.isCompleted === "boolean"
    ? value.isCompleted
    : typeof value.completed === "boolean"
      ? value.completed
      : false;

const normalizeContent = (content: ContentRecord): ContentRecord => {
  if (content.type !== "subItems" || !Array.isArray(content.subItems)) return content;
  return {
    ...content,
    subItems: content.subItems.flatMap((entry) => {
      const subItem = toTitledRecord(entry);
      return subItem ? [{ ...subItem, isCompleted: completionOf(subItem) }] : [];
    }),
  };
};

const shownSubItemSchema = z.object({ title: z.string(), isCompleted: z.boolean().optional() }).passthrough();

const shownContentSchema = z.object({
  type: z.enum(CHECKLIST_CONTENT_TYPES),
  value: z.string(),
  subItems: z.array(shownSubItemSchema).optional(),
  fields: z.array(z.unknown()).optional(),
}).passthrough();

const textIdField = (id: unknown): { id?: string } => {
  const textId = readTextId(id);
  return textId === undefined ? {} : { id: textId };
};

const shownSubItem = ({ id, ...shown }: z.infer<typeof shownSubItemSchema>): ChecklistSubItem =>
  typeof id === "string" ? { ...shown, id } : shown;

const shownFields = (fields: unknown[], fieldIdPrefix: string): { fields: ChecklistFormField[] } => ({
  fields: readFormFields(fields, (index) => `${fieldIdPrefix}-field-${index + 1}`),
});

const shownContents = (contents: unknown[], itemId: string): ChecklistItemContent[] =>
  contents.flatMap((content, contentIndex) => {
    const parsed = shownContentSchema.safeParse(content);
    if (!parsed.success) return [];
    const { id, subItems, fields, ...shown } = parsed.data;
    return [{
      ...shown,
      ...textIdField(id),
      ...(subItems ? { subItems: subItems.map(shownSubItem) } : {}),
      ...(shown.type === "form" ? shownFields(fields ?? [], `${itemId}-form-${contentIndex + 1}`) : {}),
    }];
  });

export function normalizeSections(raw: unknown): ChecklistSection[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((section, sectionIndex) => {
    if (!isSectionRecord(section)) return [];
    const rawItems = Array.isArray(section.items) ? (section.items as unknown[]) : [];

    return [{
      id: typeof section.id === "string" ? section.id : String(sectionIndex + 1),
      title: typeof section.title === "string" ? section.title : "Checklist",
      items: rawItems.flatMap((entry, itemIndex) => {
        const titled = toTitledRecord(entry);
        if (!titled) return [];

        const it = sanitizeStoredItem(
          Array.isArray(titled.contents)
            ? { ...titled, contents: titled.contents.filter(isContentRecord).map(normalizeContent) }
            : titled,
        );
        const id = typeof it.id === "string" ? it.id : `${sectionIndex + 1}-${itemIndex + 1}`;
        const contents = Array.isArray(it.contents) ? shownContents(it.contents, id) : undefined;

        const { completed, ...rest }: JsonRecord = it;
        return [{
          ...rest,
          id,
          title: typeof it.title === "string" ? it.title : "",
          isCompleted: completionOf(it),
          contents,
        }];
      }),
    } satisfies ChecklistSection];
  });
}

export type RunTaskCounts = {
  subTasksCompleted: number;
  subTasksTotal: number;
  tasksCompleted: number;
  tasksTotal: number;
};

export function countRunTasks(sections: ChecklistSection[]): RunTaskCounts {
  const counts: RunTaskCounts = { subTasksCompleted: 0, subTasksTotal: 0, tasksCompleted: 0, tasksTotal: 0 };

  for (const section of sections) {
    for (const item of section.items) {
      counts.tasksTotal += 1;
      if (item.isCompleted === true) counts.tasksCompleted += 1;

      for (const content of item.contents ?? []) {
        if (content.type !== "subItems" || !Array.isArray(content.subItems)) continue;
        for (const subItem of content.subItems) {
          counts.subTasksTotal += 1;
          if (subItem.isCompleted === true) counts.subTasksCompleted += 1;
        }
      }
    }
  }

  return counts;
}

export function calculateSectionsProgress(sections: ChecklistSection[]): number {
  const counts = countRunTasks(sections);
  const total = counts.tasksTotal + counts.subTasksTotal;
  const completed = counts.tasksCompleted + counts.subTasksCompleted;
  return toProgressPercent(completed, total);
}

export function resetSectionsCompletion(sections: ChecklistSection[]): ChecklistSection[] {
  return normalizeSections(sections).map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isCompleted: false,
      contents: item.contents?.map((content) => {
        if (content.type === "form") {
          return { ...content, fields: (content.fields ?? []).map(({ answer: _cleared, ...field }) => field) };
        }
        if (content.type !== "subItems") return content;
        if (!Array.isArray(content.subItems)) return { ...content, subItems: [] };
        return {
          ...content,
          subItems: content.subItems.map((subItem) => ({
            ...subItem,
            isCompleted: false,
          })),
        };
      }),
    })),
  }));
}

