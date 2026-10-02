import {
  portableChecklistTemplateSchema,
  type PortableChecklistTemplate,
} from "./checklistSchema";
import { formatZodIssues } from "./formatValidationError";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBlank = (value: unknown): boolean => typeof value !== "string" || value.trim() === "";

const CONTENT_TYPES = new Set(["text", "image", "video", "file", "embed", "subItems"]);
const VALUE_CONTENT_TYPES = new Set(["image", "video", "file", "embed"]);

const withoutKey = (record: JsonRecord, key: string): JsonRecord => {
  const { [key]: _dropped, ...rest } = record;
  return rest;
};

const withoutNonString = (record: JsonRecord, key: string): JsonRecord =>
  typeof record[key] === "string" || !(key in record) ? record : withoutKey(record, key);

const withPortableId = (record: JsonRecord): JsonRecord =>
  typeof record.id === "number" && Number.isFinite(record.id)
    ? { ...record, id: String(record.id) }
    : withoutNonString(record, "id");

const UPLOAD_TYPES = new Set(["url", "upload"]);

const FIRST_PROBLEM_ONLY = 1;

function withPortableContentKeys(content: JsonRecord): JsonRecord {
  let cleaned = withoutNonString(withPortableId(content), "fileName");
  if ("fileSize" in cleaned && !(typeof cleaned.fileSize === "number" && Number.isFinite(cleaned.fileSize))) {
    cleaned = withoutKey(cleaned, "fileSize");
  }
  if ("uploadType" in cleaned && !UPLOAD_TYPES.has(cleaned.uploadType as string)) {
    cleaned = withoutKey(cleaned, "uploadType");
  }
  if (!("subItems" in cleaned)) return cleaned;
  if (!Array.isArray(cleaned.subItems)) return withoutKey(cleaned, "subItems");
  const subItems = cleaned.subItems
    .filter((subItem): subItem is JsonRecord => isRecord(subItem) && !isBlank(subItem.title))
    .map(withPortableId);
  return { ...cleaned, subItems };
}

function normalizeContents(contents: unknown[]): JsonRecord[] {
  return contents.filter(isRecord).flatMap((record) => {
    if (typeof record.type !== "string" || !CONTENT_TYPES.has(record.type)) return [];
    const content = withPortableContentKeys(record);
    const value = typeof content.value === "string" ? content.value : "";

    if (record.type === "subItems") {
      const subItems = Array.isArray(content.subItems) ? content.subItems : [];
      return subItems.length > 0 ? [{ ...content, value, subItems }] : [];
    }

    if (VALUE_CONTENT_TYPES.has(record.type) && isBlank(value)) return [];
    const { subItems: _notSubTasks, ...block } = content;
    return [{ ...block, value }];
  });
}

export function normalizePortableSections(sections: unknown): JsonRecord[] {
  if (!Array.isArray(sections)) return [];

  return sections.flatMap((section, sectionIndex) => {
    if (!isRecord(section)) return [];
    const items = (Array.isArray(section.items) ? section.items : [])
      .filter(isRecord)
      .map((item, itemIndex) => ({
        ...withoutNonString(item, "description"),
        title: isBlank(item.title) ? `Task ${itemIndex + 1}` : item.title,
        ...(Array.isArray(item.contents) ? { contents: normalizeContents(item.contents) } : {}),
      }));
    if (items.length === 0) return [];

    return [{ ...section, title: isBlank(section.title) ? `Section ${sectionIndex + 1}` : section.title, items }];
  });
}

export type PortableTemplateParseResult =
  | { success: true; data: PortableChecklistTemplate }
  | { success: false; title: string; reason: string };

export function parsePortableTemplate(input: unknown): PortableTemplateParseResult {
  const record = isRecord(input) ? input : {};
  const title = typeof record.title === "string" ? record.title : "";
  const sections = normalizePortableSections(record.sections);
  if (sections.length === 0) {
    return { success: false, title, reason: "Template has no sections with tasks" };
  }

  const result = portableChecklistTemplateSchema.safeParse({
    ...withoutNonString(record, "description"),
    type: record.type === "recipe" ? "recipe" : "checklist",
    sections,
  });
  if (result.success) return { success: true, data: result.data };

  return { success: false, title, reason: formatZodIssues(result.error, FIRST_PROBLEM_ONLY) };
}
