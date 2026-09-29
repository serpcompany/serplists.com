import type { ChecklistTemplate, TemplateImportOptions } from "@/types/checklist";

// Turns parsed templates into the ones an import sends: fresh ids, the chosen visibility,
// and no run state. Re-exported from ./templateBackup.ts.

/**
 * Generate unique IDs for imported templates to avoid conflicts
 */
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
      // Update timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Clear slug to regenerate
      slug: ""
    };
    
    return newTemplate;
  });
};

export type ImportVisibility = NonNullable<TemplateImportOptions["visibility"]>;

/** How the import form names each visibility choice. */
export const IMPORT_VISIBILITY_LABELS: Record<ImportVisibility, string> = {
  preserve: "Preserve visibility from file",
  public: "Force public",
  private: "Force private",
};

/**
 * Whether an imported template ends up public under the chosen visibility override.
 * The import preview and the import payload both use this, and the server applies
 * the same rule (functions/api/handlers/templates.ts), so they cannot disagree.
 * A template with no visibility flag is private unless the override says otherwise.
 */
export const resolveImportIsPublic = (
  isPublic: boolean | undefined,
  visibility: ImportVisibility = "preserve",
): boolean => (visibility === "preserve" ? isPublic ?? false : visibility === "public");

export const countImportPublicTemplates = (
  templates: Pick<ChecklistTemplate, "isPublic">[],
  visibility: ImportVisibility = "preserve",
): number => templates.filter((template) => resolveImportIsPublic(template.isPublic, visibility)).length;

/**
 * Prepare templates for import (clean and validate)
 */
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
    // Reset completion states for fresh imports
    sections: template.sections.map(section => ({
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
    }))
  }));
};
