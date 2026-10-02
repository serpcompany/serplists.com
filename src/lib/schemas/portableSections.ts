import {
  contentRecordsIn,
  sectionRecordsIn,
  subTaskRecordsIn,
  taskRecordsIn,
  type ContentRecord,
  type JsonRecord,
  type TaskRecord,
} from "./jsonRecords";

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

const toPortableContent = (content: ContentRecord): JsonRecord => ({
  ...pick(content, CONTENT_KEYS),
  ...(Array.isArray(content.subItems)
    ? { subItems: subTaskRecordsIn(content.subItems).map((subItem) => pick(subItem, SUB_ITEM_KEYS)) }
    : {}),
});

const toPortableItem = (item: TaskRecord): JsonRecord => ({
  ...pick(item, ITEM_KEYS),
  ...(Array.isArray(item.contents) ? { contents: contentRecordsIn(item.contents).map(toPortableContent) } : {}),
});

export function toPortableSections(sections: unknown): JsonRecord[] {
  return sectionRecordsIn(sections).map((section) => ({
    ...pick(section, SECTION_KEYS),
    items: taskRecordsIn(section.items).map(toPortableItem),
  }));
}
