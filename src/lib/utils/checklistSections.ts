import { toProgressPercent } from "@/lib/progress";
import type { ChecklistItemContent, ChecklistSection } from "@/types/checklist";

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

// A run's tasks are its top-level items; sub-tasks are the rows of their Sub-tasks blocks.
// They are counted apart, so a label that says "tasks" never includes sub-tasks.
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
        if (content.type !== "subItems" || !content.subItems) continue;
        for (const subItem of content.subItems) {
          counts.subTasksTotal += 1;
          if (subItem.isCompleted === true) counts.subTasksCompleted += 1;
        }
      }
    }
  }

  return counts;
}

// Overall progress weights every task and sub-task the same, like the API's
// calculateRunProgress (functions/api/utils/template-reconciliation.ts), which stores it.
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

