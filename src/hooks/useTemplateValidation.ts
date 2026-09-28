import type { ChecklistItem, ChecklistItemContent, ChecklistSection } from "@/types/checklist";
import { sectionFallbackTitle } from "@/lib/utils/checklistSections";

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

const trimmedTitle = (title: unknown): string => (typeof title === "string" ? title.trim() : "");

// Runs show every sub-task as a checkbox that counts toward progress, and Enter or "Add
// Sub-task" leaves a blank one behind, so blank sub-tasks are dropped (the others keep
// their ids: runs match them by id), and so is a Sub-tasks block left with none.
const withoutBlankSubItems = (contents: ChecklistItemContent[]): ChecklistItemContent[] =>
  contents.flatMap((content) => {
    if (content.type !== "subItems") {
      return [content];
    }

    const subItems = (content.subItems ?? []).flatMap((subItem) => {
      const title = trimmedTitle(subItem.title);
      return title ? [{ ...subItem, title }] : [];
    });
    return subItems.length > 0 ? [{ ...content, subItems }] : [];
  });

const withItemDefaults = (item: ChecklistItem, itemIndex: number): ChecklistItem => ({
  ...item,
  title: trimmedTitle(item.title) || `Task ${itemIndex + 1}`,
  ...(item.contents ? { contents: withoutBlankSubItems(item.contents) } : {}),
});

// Fills what a saved template needs: a title, at least one section, a title for every
// section ("Section N", the label the editor's outline showed), at least one titled task
// per section, and no blank sub-tasks. Deterministic, so applying it to its own result
// changes nothing; the editor shows the result after a save, since it is what was stored.
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
    sections: sections.map((section, sectionIndex) => {
      const sectionTitle = trimmedTitle(section.title) || sectionFallbackTitle(sectionIndex);

      if (section.items.length === 0) {
        return {
          ...section,
          title: sectionTitle,
          items: [{
            id: placeholderItemId(section.id, usedItemIds),
            title: "New task",
            description: "",
            isCompleted: false,
          }],
        };
      }

      return {
        ...section,
        title: sectionTitle,
        items: section.items.map(withItemDefaults),
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
