import type { ChecklistItemContent, ChecklistSection, ChecklistSubItem } from "@/types/checklist";

// The label an untitled section gets: the template editor's outline shows it, a save
// stores it, and pages show it for sections saved blank before saves defaulted them.
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

// Saves drop blank sub-tasks; older templates and runs can still hold them.
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

// A task or sub-task written as text becomes one with that title. Anything else that is not an
// object (null, a number, an array, blank text) is skipped: spreading it would store its
// characters as keys ({"0":"M","1":"i",...}) on a task with no title.
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

// Fallback ids use each entry's position in the stored array, so skipping an entry that is
// not an object never changes the ids of the entries around it.
export function normalizeSections(raw: unknown): ChecklistSection[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((section, sectionIndex) => {
    if (!isJsonRecord(section)) return [];
    const rawItems = Array.isArray(section.items) ? (section.items as unknown[]) : [];

    return [{
      id: typeof section.id === "string" ? section.id : String(sectionIndex + 1),
      title: typeof section.title === "string" ? section.title : "Checklist",
      items: rawItems.flatMap((entry, itemIndex) => {
        const it = toTitledRecord(entry);
        if (!it) return [];

        // Content entries are passed through from stored/imported JSON as-is (only legacy
        // sub-item completion is normalized), so their shape is trusted here rather than validated.
        const contents = Array.isArray(it.contents)
          ? (it.contents.filter(isJsonRecord).map(normalizeContent) as unknown as ChecklistItemContent[])
          : undefined;

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

export function calculateSectionsProgress(sections: ChecklistSection[]): number {
  let completed = 0;
  let total = 0;

  sections.forEach((section) => {
    section.items.forEach((item) => {
      total++;
      if (item.isCompleted) completed++;

      item.contents?.forEach((content) => {
        if (content.type === "subItems" && content.subItems) {
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
        if (!content.subItems) return { ...content, subItems: [] };
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

