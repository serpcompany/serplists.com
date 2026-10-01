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
