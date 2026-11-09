import { ZodError } from "zod";
import {
  isImportablePortableSchemaVersion,
  validateBackup,
  validatePortableTemplatePackEnvelope,
  validateTemplateImportArray,
  PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION
} from "@/lib/schemas/checklistSchema";
import { parsePortableTemplate } from "@/lib/schemas/portableTemplateNormalize";
import type { 
  ChecklistTemplateImport,
  PortableChecklistTemplate,
  PortableTemplatePack,
} from "@/lib/schemas/checklistSchema";
import { toPortableSections } from "@/lib/schemas/portableSections";
import { isUploadedAsset } from "@/lib/schemas/portableTemplatePack";
import { formatValidationError } from "@/lib/schemas/formatValidationError";
import { uniqueCategoryNames } from "@/lib/categorySlug";
import { normalizeStringArray, parseJsonArray } from "@/lib/schemas/jsonArrays";
import { isSectionsShape, normalizeSections } from "@/lib/utils/checklistSections";
import { findInvalidImportSectionEntry } from "@/lib/utils/importSectionEntries";
import { downloadFile } from "@/lib/utils/downloadFile";
import { withImportedLinkSource } from "@/lib/utils/mediaSource";
import {
  detectTemplateSourceExtension,
  isMarkdownTemplateExtension,
  isYamlTemplateExtension,
  parseTemplateMarkdown,
  parseTemplateYaml,
} from "@/lib/templates/templateMarkdown";
import type { ExportedTemplatePack } from "@/lib/schemas/apiTemplates";
import type { ChecklistSection, ChecklistTemplate } from "@/types/checklist";

type TemplateImportWarning = {
  templateTitle: string;
  message: string;
};

export type TemplateImportResult = {
  templates: ChecklistTemplate[];
  warnings: TemplateImportWarning[];
};

export type ParseTemplatesOptions = {
  timestampForUndatedTemplates?: string;
};

const generateTempId = (prefix: string) => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
};

const normalizeCategoryList = (value: unknown): string[] => uniqueCategoryNames(normalizeStringArray(value));

const sectionHoldingLegacyItems = (items: unknown[]) => ({ id: "1", title: "Checklist", items });

const withImportedLinkSources = (sections: ChecklistSection[]): ChecklistSection[] =>
  sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.contents ? { ...item, contents: item.contents.map(withImportedLinkSource) } : item,
    ),
  }));

const sectionsFromList = (parsed: unknown[], templateTitle: string): ChecklistSection[] => {
  if (parsed.length === 0) return [];
  const sections = isSectionsShape(parsed) ? parsed : [sectionHoldingLegacyItems(parsed)];
  const invalidEntry = findInvalidImportSectionEntry(sections);
  if (invalidEntry) {
    throw new Error(`Template "${templateTitle}": ${invalidEntry}`);
  }
  return withImportedLinkSources(normalizeSections(sections));
};

const coerceSections = (input: unknown, templateTitle: string): ChecklistSection[] | null => {
  const parsed = parseJsonArray(input);
  return parsed ? sectionsFromList(parsed, templateTitle) : null;
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
    requiredTools: template.requiredTools,
    categories: normalizeCategoryList(template.categories ?? template.category),
    tags: normalizeStringArray(template.tags),
  };
};

const normalizePortableTemplate = (
  template: PortableChecklistTemplate,
  now = new Date().toISOString(),
): ChecklistTemplate => {
  const sections = sectionsFromList(template.sections, template.title);

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
    requiredTools: template.requiredTools,
    categories: normalizeCategoryList(template.categories),
    tags: normalizeStringArray(template.tags),
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
    const assetCount = template.sections
      .flatMap((section) => section.items)
      .flatMap((item) => item.contents ?? [])
      .filter(isUploadedAsset).length;

    if (assetCount > 0) {
      warnings.push({
        templateTitle: template.title,
        message: `References ${assetCount} uploaded asset${assetCount === 1 ? "" : "s"} that will not be included in JSON exports.`,
      });
    }
  });

  return warnings;
};

export type PortableExportPack = PortableTemplatePack & {
  manifest: NonNullable<PortableTemplatePack["manifest"]> & { assetWarnings: number };
};

export const exportPortableTemplatesToJSON = (
  templates: ChecklistTemplate[],
  exportedBy?: string
): PortableExportPack => {
  const warnings = collectAssetWarnings(templates);
  const results = templates.map((template) => parsePortableTemplate({
    title: template.title,
    description: template.description || "",
    type: template.type,
    slug: template.slug || undefined,
    seoTitle: template.seoTitle || undefined,
    seoDescription: template.seoDescription || undefined,
    visibility: template.isPublic ? "public" : "private",
    categories: normalizeCategoryList(template.categories),
    tags: normalizeStringArray(template.tags),
    sections: toPortableSections(template.sections),
    rules: template.rules,
    requiredTools: template.requiredTools?.length ? template.requiredTools : undefined,
  }));
  const exported = results.flatMap((result) => (result.success ? [result.data] : []));
  const skippedTemplates = results.flatMap((result) =>
    result.success ? [] : [{ title: result.title, reason: result.reason }]
  );

  return {
    kind: "serplists-template-pack",
    schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy,
    templates: exported,
    manifest: {
      totalTemplates: exported.length,
      format: "portable",
      includesVisibility: true,
      includesRules: exported.some((template) => Array.isArray(template.rules) && template.rules.length > 0),
      assetWarnings: warnings.length,
      ...(skippedTemplates.length > 0 ? { skippedTemplates } : {}),
    },
  };
};

export const downloadBackupFile = (pack: ExportedTemplatePack, filename?: string): void => {
  const defaultFilename = `serplists-template-pack-${new Date().toISOString().split('T')[0]}.json`;
  downloadFile({
    content: JSON.stringify(pack, null, 2),
    fileName: filename || defaultFilename,
    type: "application/json",
  });
};

const parsePortablePackTemplates = (
  templates: unknown[],
  now: string,
): { templates: ChecklistTemplate[]; warnings: TemplateImportWarning[] } => {
  const results = templates.map(parsePortableTemplate);
  const warnings = results.flatMap((result, index) => result.success ? [] : [{
    templateTitle: result.title || `Template ${index + 1}`,
    message: `Skipped: ${result.reason}`,
  }]);
  const valid = results.flatMap((result) => (result.success ? [result.data] : []));
  if (valid.length === 0 && warnings.length > 0) {
    throw new Error(warnings.map((warning) => `${warning.templateTitle}: ${warning.message}`).join("; "));
  }

  return { templates: valid.map((template) => normalizePortableTemplate(template, now)), warnings };
};

export const parseTemplatesFromData = (
  data: unknown,
  { timestampForUndatedTemplates }: ParseTemplatesOptions = {},
): TemplateImportResult => {
  const now = timestampForUndatedTemplates ?? new Date().toISOString();
  try {
    let rawTemplates: ChecklistTemplateImport[] = [];
    let normalizedTemplates: ChecklistTemplate[] = [];
    let skippedWarnings: TemplateImportWarning[] = [];

    if (Array.isArray(data)) {
      rawTemplates = validateTemplateImportArray(data);
      normalizedTemplates = rawTemplates.map((template) => normalizeImportTemplate(template, now));
    } else if (data && typeof data === "object" && "kind" in data && data.kind === "serplists-template-pack") {
      const portablePackEnvelope = validatePortableTemplatePackEnvelope(data);
      if (!isImportablePortableSchemaVersion(portablePackEnvelope.schemaVersion)) {
        throw new Error(`Unsupported portable template schema version: ${portablePackEnvelope.schemaVersion}`);
      }
      const portablePack = parsePortablePackTemplates(portablePackEnvelope.templates, now);
      normalizedTemplates = portablePack.templates;
      skippedWarnings = portablePack.warnings;
    } else if (data && typeof data === "object" && "templates" in data) {
      try {
        const backup = validateBackup(data);
        rawTemplates = backup.templates;
      } catch {
        rawTemplates = validateTemplateImportArray(data.templates);
      }
      normalizedTemplates = rawTemplates.map((template) => normalizeImportTemplate(template, now));
    } else {
      throw new Error("Unsupported JSON format (expected backup or template array)");
    }

    const warnings = [...skippedWarnings, ...collectAssetWarnings(normalizedTemplates)];

    return { templates: normalizedTemplates, warnings };
  } catch (error) {
    throw new Error(`Template validation failed: ${formatValidationError(error)}`);
  }
};

const readFileText = (file: File): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });

export const parseTemplatesFromFile = async (file: File): Promise<TemplateImportResult> => {
  const sourceString = await readFileText(file);

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

    const data: unknown = JSON.parse(sourceString);
    return parseTemplatesFromData(data);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON file format");
    }
    if (error instanceof ZodError) {
      throw new Error(`Template validation failed: ${formatValidationError(error)}`);
    }
    throw new Error(formatValidationError(error));
  }
};

export {
  countImportPublicTemplates,
  IMPORT_VISIBILITY_LABELS,
  prepareTemplatesForImport,
  type ImportVisibility,
} from "./templateImportPrep";
