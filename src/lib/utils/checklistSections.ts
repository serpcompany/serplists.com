import { z } from "zod";

import { toProgressPercent } from "@/lib/progress";
import { CHECKLIST_CONTENT_TYPES, sanitizeStoredItem } from "@/lib/schemas/storedSections";
import type { ChecklistItemContent, ChecklistSection, ChecklistSubItem } from "@/types/checklist";

export function sectionFallbackTitle(sectionIndex: number): string {
  return `Section ${sectionIndex + 1}`;
}

const displayTitle = (title: unknown): string =>
  typeof title === "string" ? title.trim() : "";

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
  if (value.length === 0) return true;
  const first = value[0] as Record<string, unknown>;
  return typeof first?.items !== "undefined";
}

type JsonRecord = Record<string, unknown>;

export const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toTitledRecord = (value: unknown): JsonRecord | null => {
  if (typeof value === "string") {
    const title = value.trim();
    return title ? { title } : null;
  }
  return isJsonRecord(value) ? value : null;
};

const completionOf = (value: JsonRecord): boolean =>
  typeof value.isCompleted === "boolean"
    ? value.isCompleted
    : typeof value.completed === "boolean"
      ? value.completed
      : false;

const normalizeContent = (content: JsonRecord): JsonRecord => {
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
}).passthrough();

const shownContents = (contents: unknown[]): ChecklistItemContent[] =>
  contents.flatMap((content) => {
    const parsed = shownContentSchema.safeParse(content);
    return parsed.success ? [parsed.data] : [];
  });

export function normalizeSections(raw: unknown): ChecklistSection[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((section, sectionIndex) => {
    if (!isJsonRecord(section)) return [];
    const rawItems = Array.isArray(section.items) ? (section.items as unknown[]) : [];

    return [{
      id: typeof section.id === "string" ? section.id : String(sectionIndex + 1),
      title: typeof section.title === "string" ? section.title : "Checklist",
      items: rawItems.flatMap((entry, itemIndex) => {
        const titled = toTitledRecord(entry);
        if (!titled) return [];

        const it = sanitizeStoredItem(
          Array.isArray(titled.contents)
            ? { ...titled, contents: titled.contents.filter(isJsonRecord).map(normalizeContent) }
            : titled,
        );
        const contents = Array.isArray(it.contents) ? shownContents(it.contents) : undefined;

        const { completed: _completed, ...rest } = it;
        return [{
          ...rest,
          id: typeof it.id === "string" ? it.id : `${sectionIndex + 1}-${itemIndex + 1}`,
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

