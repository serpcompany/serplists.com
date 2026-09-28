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

export function normalizeSections(raw: unknown): ChecklistSection[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((section, sectionIndex) => {
    const s = (section ?? {}) as Record<string, unknown>;
    const rawItems = Array.isArray(s.items) ? (s.items as unknown[]) : [];

    return {
      id: typeof s.id === "string" ? s.id : String(sectionIndex + 1),
      title: typeof s.title === "string" ? s.title : "Checklist",
      items: rawItems.map((item, itemIndex) => {
        const it = (item ?? {}) as Record<string, unknown>;
        const isCompleted =
          typeof it.isCompleted === "boolean"
            ? it.isCompleted
            : typeof it.completed === "boolean"
              ? it.completed
              : false;

        const rawContents = Array.isArray(it.contents) ? (it.contents as unknown[]) : undefined;
        // Content entries are passed through from stored/imported JSON as-is (only legacy sub-item
        // completion is normalized), so their shape is trusted here rather than validated.
        const contents = rawContents?.map((c) => {
          const content = (c ?? {}) as Record<string, unknown>;
          if (content.type === "subItems" && Array.isArray(content.subItems)) {
            return {
              ...content,
              subItems: (content.subItems as unknown[]).map((si) => {
                const subItem = (si ?? {}) as Record<string, unknown>;
                return {
                  ...subItem,
                  isCompleted:
                    typeof subItem.isCompleted === "boolean"
                      ? subItem.isCompleted
                      : typeof subItem.completed === "boolean"
                        ? subItem.completed
                        : false,
                };
              }),
            };
          }
          return content;
        }) as ChecklistItemContent[] | undefined;

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

