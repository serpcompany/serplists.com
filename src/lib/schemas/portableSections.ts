import {
  contentRecordsIn,
  formFieldRecordsIn,
  formOptionRecordsIn,
  sectionRecordsIn,
  subTaskRecordsIn,
  taskRecordsIn,
  type ContentRecord,
  type FormFieldRecord,
  type JsonRecord,
  type TaskRecord,
} from "./jsonRecords";

const SECTION_KEYS = ["id", "title"] as const;
const ITEM_KEYS = ["id", "title", "description"] as const;
const CONTENT_KEYS = ["id", "type", "value", "uploadType", "fileName", "fileSize"] as const;
const SUB_ITEM_KEYS = ["id", "title"] as const;
const FORM_FIELD_KEYS = ["id", "label", "kind", "required", "description", "min", "max"] as const;
const FORM_OPTION_KEYS = ["id", "label"] as const;

const pick = (source: JsonRecord, keys: readonly string[]): JsonRecord => {
  const picked: JsonRecord = {};
  for (const key of keys) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked;
};

const toPortableFormField = (field: FormFieldRecord): JsonRecord => ({
  ...pick(field, FORM_FIELD_KEYS),
  ...(Array.isArray(field.options)
    ? { options: formOptionRecordsIn(field.options).map((option) => pick(option, FORM_OPTION_KEYS)) }
    : {}),
});

const toPortableContent = (content: ContentRecord): JsonRecord => ({
  ...pick(content, CONTENT_KEYS),
  ...(Array.isArray(content.subItems)
    ? { subItems: subTaskRecordsIn(content.subItems).map((subItem) => pick(subItem, SUB_ITEM_KEYS)) }
    : {}),
  ...(content.type === "form" && Array.isArray(content.fields)
    ? { fields: formFieldRecordsIn(content.fields).map(toPortableFormField) }
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
