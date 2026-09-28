// The sections of a portable export: only the keys the portable format defines. Stored
// sections also hold run state (isCompleted, the legacy completed, notes) and whatever
// older writers left behind, which does not belong in a file meant for sharing and
// tools. Shared by the app's exporter and GET /api/templates/backup?format=portable.

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const SECTION_KEYS = ["id", "title"] as const;
const ITEM_KEYS = ["id", "title", "description"] as const;
const CONTENT_KEYS = ["id", "type", "value", "uploadType", "fileName", "fileSize"] as const;
const SUB_ITEM_KEYS = ["id", "title"] as const;

const pick = (source: JsonRecord, keys: readonly string[]): JsonRecord => {
  const picked: JsonRecord = {};
  for (const key of keys) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
};

// Entries that are not objects are dropped: they are not sections, tasks or blocks, and
// the app already skips them when it reads a template.
const records = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const toPortableContent = (content: JsonRecord): JsonRecord => ({
  ...pick(content, CONTENT_KEYS),
  ...(Array.isArray(content.subItems)
    ? { subItems: records(content.subItems).map((subItem) => pick(subItem, SUB_ITEM_KEYS)) }
    : {}),
});

const toPortableItem = (item: JsonRecord): JsonRecord => ({
  ...pick(item, ITEM_KEYS),
  ...(Array.isArray(item.contents) ? { contents: records(item.contents).map(toPortableContent) } : {}),
});

export function toPortableSections(sections: unknown): JsonRecord[] {
  return records(sections).map((section) => ({
    ...pick(section, SECTION_KEYS),
    items: records(section.items).map(toPortableItem),
  }));
}
