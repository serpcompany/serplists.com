import {
  portableChecklistTemplateSchema,
  type PortableChecklistTemplate,
} from "./checklistSchema";
import { formatZodIssues } from "./formatValidationError";

// The editor saves content the strict portable schema rejects: an untitled default section
// (the outline shows "Section N"), a blank trailing sub-task, empty media blocks. Export and
// import both run templates through this normalizer so every pack we write can be read back,
// including packs exported before it existed. Ids are kept: they are stable identities.

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

// Ids are optional. A lenient JSON import can store a numeric one: keep it as a string.
const withPortableId = (record: JsonRecord): JsonRecord =>
  typeof record.id === "number" && Number.isFinite(record.id)
    ? { ...record, id: String(record.id) }
    : withoutNonString(record, "id");

const UPLOAD_TYPES = new Set(["url", "upload"]);

// Stored blocks can hold null (read as absent) or ill-typed file details and ids. Only keys
// that are present and invalid change, so a valid block comes out exactly as it went in.
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
    return [{ ...content, value }];
  });
}

/**
 * Makes stored or imported sections valid for the portable schema: blank section titles
 * become "Section N" and blank task titles "Task N" (N is the position, as the editor shows
 * it); blank sub-tasks, empty sub-task blocks, and media or embed blocks without a value are
 * dropped; sections left without tasks are dropped. On content blocks and Sub-tasks a
 * numeric id becomes a string and any other non-string id is dropped, and a fileName that is
 * not a string, a fileSize that is not a finite number, or an uploadType other than "url"
 * or "upload" (null included) is dropped.
 */
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

/** Normalizes one template from a portable pack, then validates it on its own. */
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

  // One readable line naming the first problem ("Section 1 > Item 2 > id: ...").
  return { success: false, title, reason: formatZodIssues(result.error, 1) };
}
