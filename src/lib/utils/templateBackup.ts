import { ZodError } from "zod";
import { 
  validateBackup, 
  validatePortableTemplatePackEnvelope,
  validatePortableTemplatePack,
  validateTemplateImportArray,
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION
} from "@/lib/schemas/checklistSchema";
import type { 
  ChecklistTemplateImport,
  PortableChecklistTemplate,
  PortableTemplatePack,
  TemplateBackup
} from "@/lib/schemas/checklistSchema";
import { toPortableSections } from "@/lib/schemas/portableSections";
import { formatValidationError } from "@/lib/schemas/formatValidationError";
import { uniqueCategoryNames } from "@/lib/categorySlug";
import { isSectionsShape, normalizeSections } from "@/lib/utils/checklistSections";
import { findInvalidImportSectionEntry } from "@/lib/utils/importSectionEntries";
import { withImportedLinkSource } from "@/lib/utils/mediaSource";
import {
  detectTemplateSourceExtension,
  isMarkdownTemplateExtension,
  isYamlTemplateExtension,
  parseTemplateMarkdown,
  parseTemplateYaml,
} from "@/lib/templates/templateMarkdown";
import type { ChecklistSection, ChecklistTemplate, TemplateImportOptions } from "@/types/checklist";

export type TemplateImportWarning = {
  templateTitle: string;
  message: string;
};

// Backup built from in-app templates. Their content ids are optional, so this is not
// guaranteed to satisfy the stricter `TemplateBackup` schema used when validating uploads.
export type TemplateBackupExport = Omit<TemplateBackup, "templates"> & {
  templates: ChecklistTemplate[];
};

export type TemplateImportResult = {
  templates: ChecklistTemplate[];
  warnings: TemplateImportWarning[];
};

export type ParseTemplatesOptions = {
  /** Date for templates the source does not date. Defaults to the parse time. */
  fallbackTimestamp?: string;
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

// Categories repeat nothing that shares a slug ('SEO', 'seo'), so a template counts once
// toward each category page.
const normalizeCategoryList = (value: unknown): string[] => uniqueCategoryNames(normalizeStringList(value));

// A flat list of tasks (the legacy `items` form) goes into one "Checklist" section.
const coerceSections = (input: unknown, templateTitle: string): ChecklistSection[] | null => {
  const parsed = parseJsonArray(input);
  if (!parsed) return null;
  if (parsed.length === 0) return [];
  const sections = isSectionsShape(parsed) ? parsed : [{ id: "1", title: "Checklist", items: parsed }];
  const invalidEntry = findInvalidImportSectionEntry(sections);
  if (invalidEntry) {
    throw new Error(`Template "${templateTitle}": ${invalidEntry}`);
  }
  // A linked file named without uploadType keeps its name in the editor and in runs.
  return normalizeSections(sections).map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.contents ? { ...item, contents: item.contents.map(withImportedLinkSource) } : item,
    ),
  }));
};

const normalizeImportTemplate = (
  template: ChecklistTemplateImport,
  now = new Date().toISOString(),
): ChecklistTemplate => {
  const hasSectionsField = typeof template.sections !== "undefined" || typeof template.items !== "undefined";
  if (!hasSectionsField) {
    throw new Error(`Template "${template.title}" is missing sections/items`);
  }

  const sections = coerceSections(template.sections ?? template.items, template.title);
  if (!sections) {
    throw new Error(`Template "${template.title}" has invalid sections/items`);
  }

  return {
    id: template.id || generateTempId("temp"),
    title: template.title,
    description: template.description || "",
    type: template.type,
    sections,
    userId: template.userId || "unknown",
    createdAt: template.createdAt || now,
    updatedAt: template.updatedAt || now,
    isPublic: template.isPublic ?? false,
    version: typeof template.version === "number" ? template.version : 1,
    slug: template.slug || "",
    seoTitle: template.seoTitle || "",
    seoDescription: template.seoDescription || "",
    rules: template.rules,
    categories: normalizeCategoryList(template.categories ?? template.category),
    tags: normalizeStringList(template.tags),
  };
};

const normalizePortableTemplate = (
  template: PortableChecklistTemplate,
  now = new Date().toISOString(),
): ChecklistTemplate => {
  const sections = coerceSections(template.sections, template.title);
  if (!sections) {
    throw new Error(`Template "${template.title}" has invalid sections`);
  }

  return {
    id: generateTempId("portable"),
    title: template.title,
    description: template.description || "",
    type: template.type,
    sections,
    userId: "portable-import",
    createdAt: now,
    updatedAt: now,
    isPublic: template.visibility === "public",
    version: 1,
    slug: template.slug || "",
    seoTitle: template.seoTitle || "",
    seoDescription: template.seoDescription || "",
    rules: template.rules,
    categories: normalizeCategoryList(template.categories),
    tags: normalizeStringList(template.tags),
  };
};

const normalizePortableData = (data: PortableChecklistTemplate | PortableTemplatePack): TemplateImportResult => {
  const normalizedTemplates = ("kind" in data ? data.templates : [data]).map((template) =>
    normalizePortableTemplate(template)
  );
  const warnings = collectAssetWarnings(normalizedTemplates);
  return { templates: normalizedTemplates, warnings };
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
): TemplateBackupExport => {
  const publicTemplates = templates.filter(t => t.isPublic);
  const privateTemplates = templates.filter(t => !t.isPublic);

  const backup: TemplateBackupExport = {
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

export const exportPortableTemplatesToJSON = (
  templates: ChecklistTemplate[],
  exportedBy?: string
): PortableTemplatePack => {
  const warnings = collectAssetWarnings(templates);

  return {
    kind: "serplists-template-pack",
    schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    templates: templates.map((template) => ({
      title: template.title,
      description: template.description || "",
      type: template.type,
      slug: template.slug || undefined,
      seoTitle: template.seoTitle || undefined,
      seoDescription: template.seoDescription || undefined,
      visibility: template.isPublic ? "public" : "private",
      categories: normalizeCategoryList(template.categories),
      tags: normalizeStringList(template.tags),
      // Only portable keys: no run state such as isCompleted.
      sections: toPortableSections(template.sections) as PortableChecklistTemplate["sections"],
      rules: template.rules,
    })),
    manifest: {
      totalTemplates: templates.length,
      format: "portable",
      includesVisibility: true,
      includesRules: templates.some((template) => Array.isArray(template.rules) && template.rules.length > 0),
      assetWarnings: warnings.length,
    },
  };
};

/**
 * Download backup as JSON file
 */
export const downloadBackupFile = (
  backup: TemplateBackupExport | PortableTemplatePack,
  filename?: string
): void => {
  const jsonString = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const defaultFilename =
    "kind" in backup && backup.kind === "serplists-template-pack"
      ? `serplists-template-pack-${new Date().toISOString().split('T')[0]}.json`
      : `checklist-templates-backup-${new Date().toISOString().split('T')[0]}.json`;
  
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || defaultFilename;
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
    
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const data = JSON.parse(jsonString);
        const validatedBackup = validateBackup(data);
        resolve(validatedBackup);
      } catch (error) {
        if (error instanceof SyntaxError) {
          reject(new Error("Invalid JSON file format"));
        } else {
          reject(new Error(`Backup validation failed: ${formatValidationError(error)}`));
        }
      }
    };
    
    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    
    reader.readAsText(file);
  });
};

export const parseTemplatesFromData = (
  data: unknown,
  { fallbackTimestamp }: ParseTemplatesOptions = {},
): TemplateImportResult => {
  const now = fallbackTimestamp ?? new Date().toISOString();
  try {
    let rawTemplates: ChecklistTemplateImport[] = [];
    let normalizedTemplates: ChecklistTemplate[] = [];

    if (Array.isArray(data)) {
      rawTemplates = validateTemplateImportArray(data);
      normalizedTemplates = rawTemplates.map((template) => normalizeImportTemplate(template, now));
    } else if (data && typeof data === "object" && "kind" in data && (data as { kind?: unknown }).kind === "serplists-template-pack") {
      const portablePackEnvelope = validatePortableTemplatePackEnvelope(data);
      if (portablePackEnvelope.schemaVersion !== PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION) {
        throw new Error(`Unsupported portable template schema version: ${portablePackEnvelope.schemaVersion}`);
      }
      const portablePack = validatePortableTemplatePack(data);
      normalizedTemplates = portablePack.templates.map((template) => normalizePortableTemplate(template, now));
    } else if (data && typeof data === "object" && "templates" in data) {
      try {
        const backup = validateBackup(data);
        rawTemplates = backup.templates;
      } catch {
        rawTemplates = validateTemplateImportArray((data as { templates: unknown }).templates);
      }
      normalizedTemplates = rawTemplates.map((template) => normalizeImportTemplate(template, now));
    } else {
      throw new Error("Unsupported JSON format (expected backup or template array)");
    }

    const warnings = collectAssetWarnings(normalizedTemplates);

    return { templates: normalizedTemplates, warnings };
  } catch (error) {
    throw new Error(`Template validation failed: ${formatValidationError(error)}`);
  }
};

/**
 * Parse templates from various JSON formats (backup or simple array)
 */
export const parseTemplatesFromJSON = async (file: File): Promise<TemplateImportResult> => {
  const jsonString = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

  try {
    const data = JSON.parse(jsonString);
    return parseTemplatesFromData(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON file format");
    }
    throw error;
  }
};

export const parseTemplatesFromFile = async (file: File): Promise<TemplateImportResult> => {
  const sourceString = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target?.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

  const extension = detectTemplateSourceExtension(file.name);
  if (!extension) {
    throw new Error("Unsupported template file type");
  }

  try {
    if (isMarkdownTemplateExtension(extension)) {
      return normalizePortableData(parseTemplateMarkdown(sourceString));
    }

    if (isYamlTemplateExtension(extension)) {
      return normalizePortableData(parseTemplateYaml(sourceString));
    }

    return parseTemplatesFromData(JSON.parse(sourceString));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON file format");
    }
    // Markdown and YAML parsers throw raw ZodErrors, whose message is a JSON dump.
    if (error instanceof ZodError) {
      throw new Error(`Template validation failed: ${formatValidationError(error)}`);
    }
    throw new Error(error instanceof Error ? formatValidationError(error) : "Failed to parse template file");
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

export type ImportVisibility = NonNullable<TemplateImportOptions["visibility"]>;

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
