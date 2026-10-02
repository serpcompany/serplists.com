import type { ChecklistItem, ChecklistItemContent, ChecklistSection } from "@/types/checklist";
import { DEFAULT_TEMPLATE_TITLE } from "@/lib/schemas/templateFields";
import { sectionFallbackTitle } from "@/lib/utils/checklistSections";

export interface ValidationError {
  type: string;
  message: string;
}

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

export const applyTemplateSaveDefaults = (
  title: string,
  sections: ChecklistSection[],
): { title: string; sections: ChecklistSection[] } => {
  const defaultTitle = title.trim() || DEFAULT_TEMPLATE_TITLE;

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

export const useTemplateValidation = () => ({ applyDefaults: applyTemplateSaveDefaults });
