import { ChecklistSection } from "@/types/checklist";

export interface ValidationError {
  type: string;
  message: string;
}

// Placeholder task ids come from the section id, so saving the same empty section again
// sends the same id: runs match tasks by id and would otherwise retire the placeholder
// (with a runner's completion) and add a new one on every save. The id never repeats
// a task id already in the template.
const placeholderItemId = (sectionId: string, usedItemIds: Set<string>): string => {
  const base = `${sectionId}-first-task`;
  let id = base;
  for (let suffix = 2; usedItemIds.has(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  usedItemIds.add(id);
  return id;
};

// Fills what a saved template needs: a title, at least one section, and at least one
// titled task per section. Deterministic, so applying it to its own result changes
// nothing; the editor shows the result after a save, since it is what was stored.
export const applyTemplateSaveDefaults = (
  title: string,
  sections: ChecklistSection[],
): { title: string; sections: ChecklistSection[] } => {
  const defaultTitle = title.trim() || "Untitled Template";

  if (sections.length === 0) {
    return {
      title: defaultTitle,
      sections: [{
        id: "getting-started",
        title: "Getting Started",
        items: [{
          id: "getting-started-first-task",
          title: "First task",
          description: "",
          isCompleted: false,
        }],
      }],
    };
  }

  const usedItemIds = new Set(
    sections.flatMap((section) => section.items.map((item) => item.id)),
  );

  return {
    title: defaultTitle,
    sections: sections.map((section) => {
      if (section.items.length === 0) {
        return {
          ...section,
          items: [{
            id: placeholderItemId(section.id, usedItemIds),
            title: "New task",
            description: "",
            isCompleted: false,
          }],
        };
      }

      // Auto-generate titles for items without titles
      return {
        ...section,
        items: section.items.map((item, itemIndex: number) => ({
          ...item,
          title: item.title.trim() || `Task ${itemIndex + 1}`,
        })),
      };
    }),
  };
};

export const useTemplateValidation = () => {
  const validate = (
    _title: string,
    _sections: ChecklistSection[]
  ): ValidationError[] => {
    // No longer return validation errors - instead we'll provide defaults
    return [];
  };

  return { validate, applyDefaults: applyTemplateSaveDefaults };
};
