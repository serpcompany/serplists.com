import {
  portableChecklistTemplateSchema,
  type PortableChecklistTemplate,
} from "./checklistSchema";
import { formatZodIssues } from "./formatValidationError";
import { isFormChoiceKind, isFormFieldKind } from "./formFields";
import {
  formFieldRecordsIn,
  formOptionRecordsIn,
  isContentRecord,
  isRecord,
  isSectionRecord,
  isSubTaskRecord,
  isTaskRecord,
  type ContentRecord,
  type FormFieldRecord,
  type FormOptionRecord,
  type JsonRecord,
  type SubTaskRecord,
} from "./jsonRecords";
import { CHECKLIST_CONTENT_TYPES } from "./storedSections";

interface PortableTemplateRecord extends JsonRecord {
  title?: unknown;
  description?: unknown;
  type?: unknown;
  sections?: unknown;
}

const isBlank = (value: unknown): boolean => typeof value !== "string" || value.trim() === "";

const CONTENT_TYPES = new Set<string>(CHECKLIST_CONTENT_TYPES);
const VALUE_CONTENT_TYPES = new Set(["image", "video", "file", "embed"]);

const withoutKey = (record: JsonRecord, key: string): JsonRecord => {
  const { [key]: dropped, ...rest } = record;
  return rest;
};

const withoutNonString = (record: JsonRecord, key: string): JsonRecord =>
  typeof record[key] === "string" || !(key in record) ? record : withoutKey(record, key);

const withPortableId = (record: ContentRecord | SubTaskRecord | FormFieldRecord | FormOptionRecord): JsonRecord =>
  typeof record.id === "number" && Number.isFinite(record.id)
    ? { ...record, id: String(record.id) }
    : withoutNonString(record, "id");

const UPLOAD_TYPES = new Set<unknown>(["url", "upload"]);

const FIRST_PROBLEM_ONLY = 1;

function withPortableContentKeys(content: ContentRecord): ContentRecord {
  let cleaned: ContentRecord = withoutNonString(withPortableId(content), "fileName");
  if ("fileSize" in cleaned && !(typeof cleaned.fileSize === "number" && Number.isFinite(cleaned.fileSize))) {
    cleaned = withoutKey(cleaned, "fileSize");
  }
  if ("uploadType" in cleaned && !UPLOAD_TYPES.has(cleaned.uploadType)) {
    cleaned = withoutKey(cleaned, "uploadType");
  }
  if (!("subItems" in cleaned)) return cleaned;
  if (!Array.isArray(cleaned.subItems)) return withoutKey(cleaned, "subItems");
  const subItems = cleaned.subItems
    .filter((subItem): subItem is SubTaskRecord => isSubTaskRecord(subItem) && !isBlank(subItem.title))
    .map(withPortableId);
  return { ...cleaned, subItems };
}

const isFiniteNumber = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value);

function withPortableFieldKeys(field: FormFieldRecord): JsonRecord[] {
  const { kind } = field;
  if (!isFormFieldKind(kind) || isBlank(field.label)) return [];
  const { answer, options, min, max, required, ...rest } = field;
  let cleaned = withoutNonString(withPortableId(rest), "description");
  if (typeof required === "boolean") cleaned = { ...cleaned, required };
  if (kind === "number") {
    cleaned = { ...cleaned, ...(isFiniteNumber(min) ? { min } : {}), ...(isFiniteNumber(max) ? { max } : {}) };
  }
  if (!isFormChoiceKind(kind)) return [cleaned];
  const kept = formOptionRecordsIn(options).filter((option) => !isBlank(option.label)).map(withPortableId);
  return kept.length > 0 ? [{ ...cleaned, options: kept }] : [];
}

function normalizeContents(contents: unknown[]): JsonRecord[] {
  return contents.filter(isContentRecord).flatMap((record) => {
    if (typeof record.type !== "string" || !CONTENT_TYPES.has(record.type)) return [];
    const content = withPortableContentKeys(record);
    const value = typeof content.value === "string" ? content.value : "";

    const { fields, ...withoutFields } = content;
    if (record.type === "form") {
      const { subItems, ...form } = withoutFields;
      const kept = formFieldRecordsIn(fields).flatMap(withPortableFieldKeys);
      return kept.length > 0 ? [{ ...form, value, fields: kept }] : [];
    }

    if (record.type === "subItems") {
      const subItems = Array.isArray(content.subItems) ? content.subItems : [];
      return subItems.length > 0 ? [{ ...withoutFields, value, subItems }] : [];
    }

    if (VALUE_CONTENT_TYPES.has(record.type) && isBlank(value)) return [];
    const { subItems, ...block } = withoutFields;
    return [{ ...block, value }];
  });
}

export function normalizePortableSections(sections: unknown): JsonRecord[] {
  if (!Array.isArray(sections)) return [];

  return sections.flatMap((section, sectionIndex) => {
    if (!isSectionRecord(section)) return [];
    const items = (Array.isArray(section.items) ? section.items : [])
      .filter(isTaskRecord)
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
  const record: PortableTemplateRecord = isRecord(input) ? input : {};
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
