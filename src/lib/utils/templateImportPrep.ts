import type { ChecklistSection, ChecklistTemplate, TemplateImportOptions } from "@/types/checklist";

export const generateUniqueIds = (templates: ChecklistTemplate[]): ChecklistTemplate[] => {
  return templates.map(template => {
    const newTemplate: ChecklistTemplate = {
      ...template,
      id: `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sections: template.sections.map(section => ({
        ...section,
        id: `section_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        items: section.items.map(item => ({
          ...item,
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          contents: item.contents?.map(content => ({
            ...content,
            subItems: content.subItems?.map(subItem => ({
              ...subItem,
              id: `subitem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }))
          }))
        }))
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      slug: ""
    };
    
    return newTemplate;
  });
};

export type ImportVisibility = NonNullable<TemplateImportOptions["visibility"]>;

export const IMPORT_VISIBILITY_LABELS: Record<ImportVisibility, string> = {
  preserve: "Preserve visibility from file",
  public: "Force public",
  private: "Force private",
};

export const resolveImportIsPublic = (
  isPublic: boolean | undefined,
  visibility: ImportVisibility = "preserve",
): boolean => (visibility === "preserve" ? isPublic ?? false : visibility === "public");

export const countImportPublicTemplates = (
  templates: Pick<ChecklistTemplate, "isPublic">[],
  visibility: ImportVisibility = "preserve",
): number => templates.filter((template) => resolveImportIsPublic(template.isPublic, visibility)).length;

const withCompletionCleared = (sections: ChecklistSection[]): ChecklistSection[] =>
  sections.map(section => ({
    ...section,
    items: section.items.map(item => ({
      ...item,
      isCompleted: false,
      contents: item.contents?.map(content => ({
        ...content,
        subItems: content.subItems?.map(subItem => ({
          ...subItem,
          isCompleted: false
        }))
      }))
    }))
  }));

export const prepareTemplatesForImport = (
  templates: ChecklistTemplate[],
  userId: string,
  options: TemplateImportOptions = {}
): ChecklistTemplate[] => {
  const templatesWithUniqueIds = generateUniqueIds(templates);

  return templatesWithUniqueIds.map(template => ({
    ...template,
    userId,
    isPublic: resolveImportIsPublic(template.isPublic, options.visibility),
    sections: withCompletionCleared(template.sections),
  }));
};
