import { 
  validateBackup, 
  validateTemplateImportArray
} from "@/lib/schemas/checklistSchema";
import type { 
  ChecklistTemplate, 
  ChecklistTemplateImport,
  ChecklistSection,
  TemplateBackup
} from "@/lib/schemas/checklistSchema";
import { isSectionsShape, normalizeSections } from "@/lib/utils/checklistSections";
import type { TemplateImportOptions } from "@/types/checklist";

export type TemplateImportWarning = {
  templateTitle: string;
  message: string;
};

export type TemplateImportResult = {
  templates: ChecklistTemplate[];
  warnings: TemplateImportWarning[];
};

const generateTempId = (prefix: string) => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const parseJsonArray = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeStringList = (value: unknown): string[] => {
  const parsed = parseJsonArray(value);
  if (parsed) {
    return parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

const coerceSections = (input: unknown): ChecklistSection[] | null => {
  const parsed = parseJsonArray(input);
  if (!parsed) return null;
  if (parsed.length === 0) return [];
  if (isSectionsShape(parsed)) {
    return normalizeSections(parsed);
  }
  return normalizeSections([
    {
      id: "1",
      title: "Checklist",
      items: parsed,
    },
  ]);
};

const normalizeImportTemplate = (template: ChecklistTemplateImport): ChecklistTemplate => {
  const now = new Date().toISOString();
  const hasSectionsField = typeof template.sections !== "undefined" || typeof template.items !== "undefined";
  if (!hasSectionsField) {
    throw new Error(`Template "${template.title}" is missing sections/items`);
  }

  const sections = coerceSections(template.sections ?? template.items);
  if (!sections) {
    throw new Error(`Template "${template.title}" has invalid sections/items`);
  }

  return {
    id: template.id || generateTempId("temp"),
    title: template.title,
    description: template.description || "",
    sections,
    userId: template.userId || "unknown",
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || now,
    isPublic: template.isPublic ?? false,
    slug: template.slug || "",
    categories: normalizeStringList(template.categories ?? template.category),
    tags: normalizeStringList(template.tags),
  };
};

const collectAssetWarnings = (templates: ChecklistTemplate[]): TemplateImportWarning[] => {
  const warnings: TemplateImportWarning[] = [];

  templates.forEach((template) => {
    let assetCount = 0;
    template.sections.forEach((section) => {
      section.items.forEach((item) => {
        item.contents?.forEach((content) => {
          const value = typeof content.value === "string" ? content.value : "";
          const isUpload =
            content.uploadType === "upload" ||
            value.includes("/api/uploads/file") ||
            value.includes("uploads/file?key=");

          if (content.type === "image" || content.type === "video" || content.type === "file") {
            if (isUpload) assetCount += 1;
          }
        });
      });
    });

    if (assetCount > 0) {
      warnings.push({
        templateTitle: template.title,
        message: `References ${assetCount} uploaded asset${assetCount === 1 ? "" : "s"} that will not be included in JSON exports.`,
      });
    }
  });

  return warnings;
};

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
export const parseTemplatesFromJSON = async (file: File): Promise<TemplateImportResult> => {
  const jsonString = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event: Event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

  try {
    const data = JSON.parse(jsonString);

    let rawTemplates: ChecklistTemplateImport[] = [];

    if (Array.isArray(data)) {
      rawTemplates = validateTemplateImportArray(data);
    } else if (data && typeof data === "object" && "templates" in data) {
      try {
        const backup = validateBackup(data);
        rawTemplates = backup.templates;
      } catch {
        rawTemplates = validateTemplateImportArray((data as { templates: unknown }).templates);
      }
    } else {
      throw new Error("Unsupported JSON format (expected backup or template array)");
    }

    // Normalize into full templates for preview/import
    const normalizedTemplates = rawTemplates.map((template) => normalizeImportTemplate(template));
    const warnings = collectAssetWarnings(normalizedTemplates);

    return { templates: normalizedTemplates, warnings };
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
  options: TemplateImportOptions = {}
): ChecklistTemplate[] => {
  const templatesWithUniqueIds = generateUniqueIds(templates);
  const visibility = options.visibility ?? "preserve";
  
  return templatesWithUniqueIds.map(template => ({
    ...template,
    userId,
    isPublic:
      visibility === "public"
        ? true
        : visibility === "private"
          ? false
          : template.isPublic ?? false,
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
