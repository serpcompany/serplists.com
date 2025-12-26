import { 
  ChecklistTemplate, 
  TemplateBackup, 
  validateBackup, 
  validateTemplateArray 
} from "@/lib/schemas/checklistSchema";

/**
 * Export templates as JSON backup file
 */
export const exportTemplatesToJSON = (
  templates: ChecklistTemplate[], 
  exportedBy?: string
): TemplateBackup => {
  const publicTemplates = templates.filter(t => t.isPublic);
  const privateTemplates = templates.filter(t => !t.isPublic);

  const backup: TemplateBackup = {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    exportedBy,
    templates,
    metadata: {
      totalTemplates: templates.length,
      publicTemplates: publicTemplates.length,
      privateTemplates: privateTemplates.length
    }
  };

  return backup;
};

/**
 * Download backup as JSON file
 */
export const downloadBackupFile = (backup: TemplateBackup, filename?: string): void => {
  const jsonString = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `checklist-templates-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Parse and validate imported JSON backup
 */
export const parseBackupFile = async (file: File): Promise<TemplateBackup> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event: Event) => {
      try {
        const jsonString = event.target?.result as string;
        const data = JSON.parse(jsonString);
        const validatedBackup = validateBackup(data);
        resolve(validatedBackup);
      } catch (error) {
        if (error instanceof SyntaxError) {
          reject(new Error("Invalid JSON file format"));
        } else {
          reject(new Error(`Backup validation failed: ${(error as Error).message}`));
        }
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsText(file);
  });
};

/**
 * Parse templates from various JSON formats (backup or simple array)
 */
export const parseTemplatesFromJSON = async (file: File): Promise<ChecklistTemplate[]> => {
  const jsonString = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event: Event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

  try {
    const data = JSON.parse(jsonString);
    
    // Try to parse as backup format first
    try {
      const backup = validateBackup(data);
      return backup.templates;
    } catch {
      // If backup format fails, try simple array format
      const validatedTemplates = validateTemplateArray(data);
      
      // Ensure all required fields are present
      return validatedTemplates.map((template: { id: unknown; userId: unknown; createdAt: unknown; updatedAt: unknown; isPublic: unknown; slug: unknown }) => ({
        ...template,
        id: template.id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: template.userId || "unknown",
        createdAt: template.createdAt || new Date().toISOString(),
        updatedAt: template.updatedAt || new Date().toISOString(),
        isPublic: template.isPublic ?? true,
        slug: template.slug || ""
      }));
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON file format");
    } else {
      throw new Error(`Template validation failed: ${(error as Error).message}`);
    }
  }
};

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

/**
 * Prepare templates for import (clean and validate)
 */
export const prepareTemplatesForImport = (
  templates: ChecklistTemplate[], 
  userId: string,
  makePublic: boolean = true
): ChecklistTemplate[] => {
  const templatesWithUniqueIds = generateUniqueIds(templates);
  
  return templatesWithUniqueIds.map(template => ({
    ...template,
    userId,
    isPublic: makePublic,
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