import type { ChecklistFormField, ChecklistItem, ChecklistItemContent, ChecklistSection } from "@/types/checklist";
import { isFormChoiceKind } from "@/lib/schemas/formFields";
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

const savedFormField = (field: ChecklistFormField): ChecklistFormField[] => {
  const label = trimmedTitle(field.label);
  const options = (field.options ?? []).flatMap((option) => {
    const optionLabel = trimmedTitle(option.label);
    return optionLabel ? [{ ...option, label: optionLabel }] : [];
  });
  if (!label || (isFormChoiceKind(field.kind) && options.length === 0)) {
    return [];
  }

  const { answer, description, max, min, options: editedOptions, ...rest } = field;
  const helpText = trimmedTitle(description);
  return [{
    ...rest,
    label,
    ...(helpText ? { description: helpText } : {}),
    ...(isFormChoiceKind(field.kind) ? { options } : {}),
    ...(field.kind === "number" && min !== undefined ? { min } : {}),
    ...(field.kind === "number" && max !== undefined ? { max } : {}),
  }];
};

const withoutBlankEntries = (contents: ChecklistItemContent[]): ChecklistItemContent[] =>
  contents.flatMap((content) => {
    if (content.type === "form") {
      const fields = (content.fields ?? []).flatMap(savedFormField);
      return fields.length > 0 ? [{ ...content, fields }] : [];
    }

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
  ...(item.contents ? { contents: withoutBlankEntries(item.contents) } : {}),
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
