import { sanitizeStoredItem } from "@/lib/schemas/storedSections";
import type { ChecklistItemContent, ChecklistSection } from "@/types/checklist";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isSectionsShape(value: unknown): value is ChecklistSection[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  const first = value[0] as Record<string, unknown>;
  return typeof first?.items !== "undefined";
}

// Stored and imported checklist JSON is untrusted: runs and templates saved before the API
// checked content, or edited by hand, can hold any shape. sanitizeStoredItem (shared with the
// API) makes every task safe to render, count and save back, so one malformed task never
// breaks a page or the Runs list.
export function normalizeSections(raw: unknown): ChecklistSection[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((section, sectionIndex) => {
    const s: JsonRecord = isRecord(section) ? section : {};
    const rawItems = Array.isArray(s.items) ? (s.items as unknown[]) : [];

    return {
      id: typeof s.id === "string" ? s.id : String(sectionIndex + 1),
      title: typeof s.title === "string" ? s.title : "Checklist",
      items: rawItems.map((item, itemIndex) => {
        const it = sanitizeStoredItem(isRecord(item) ? item : {});
        const isCompleted =
          typeof it.isCompleted === "boolean"
            ? it.isCompleted
            : typeof it.completed === "boolean"
              ? it.completed
              : false;
        const contents = Array.isArray(it.contents) ? (it.contents as ChecklistItemContent[]) : undefined;

        const { completed: _completed, ...rest } = it;
        return {
          ...rest,
          id: typeof it.id === "string" ? it.id : `${sectionIndex + 1}-${itemIndex + 1}`,
          title: typeof it.title === "string" ? it.title : "",
          isCompleted,
          contents,
        };
      }),
    } satisfies ChecklistSection;
  });
}

export function calculateSectionsProgress(sections: ChecklistSection[]): number {
  let completed = 0;
  let total = 0;

  sections.forEach((section) => {
    section.items.forEach((item) => {
      total++;
      if (item.isCompleted) completed++;

      item.contents?.forEach((content) => {
        if (content.type === "subItems" && Array.isArray(content.subItems)) {
          content.subItems.forEach((subItem) => {
            total++;
            if (subItem.isCompleted) completed++;
          });
        }
      });
    });
  });

  return total > 0 ? Math.round((completed / total) * 100) : 0;
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

