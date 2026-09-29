import { normalizeSectionsPayload, parseJsonArray } from './payloads';
import { assignMissingStableTemplateIdentities, getId } from './template-reconciliation';

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const records = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

// A task's Sub-tasks in the order the identity pass numbers them: its own, then each block's.
const subItemsOf = (item: JsonRecord): JsonRecord[] => [
  ...records(item.subItems),
  ...records(item.contents).flatMap((content) => records(content.subItems)),
];

const hasMissingIdentity = (sections: unknown[]): boolean => records(sections).some((section) =>
  !getId(section) || records(section.items).some((item) =>
    !getId(item) || subItemsOf(item).some((subItem) => !getId(subItem))));

// A stored task with the ids the identity pass gave it and its Sub-tasks (stableItem).
function withItemIds(item: JsonRecord, stableItem: JsonRecord): JsonRecord {
  const subItemIds = subItemsOf(stableItem).map((subItem) => subItem.id);
  let subItemIndex = 0;
  const withIds = (subItems: unknown[]) => subItems.map((subItem) =>
    isRecord(subItem) ? { ...subItem, id: subItemIds[subItemIndex++] } : subItem);
  return {
    ...item,
    id: stableItem.id,
    ...(Array.isArray(item.subItems) ? { subItems: withIds(item.subItems) } : {}),
    ...(Array.isArray(item.contents)
      ? {
          contents: item.contents.map((content) => (
            isRecord(content) && Array.isArray(content.subItems)
              ? { ...content, subItems: withIds(content.subItems) }
              : content
          )),
        }
      : {}),
  };
}

/**
 * Stored sections as readers get them. A section, task or Sub-task stored without an id the
 * API accepts (a row older than stable ids, or a numeric, blank or whitespace id) gets the id
 * a save of these sections stores (assignMissingStableTemplateIdentities). So an editor that
 * sends them back keeps every id across saves, and a run started from them matches its
 * Template by id. Unlike the identity pass, entries that are not objects stay where they
 * are, for the readers that show them. Sections that already have every id come back as is.
 */
export function withStableTemplateIdentities(sections: unknown[]): unknown[] {
  // The identity pass reads a first section without a task list as a flat task list.
  if (!Array.isArray(records(sections)[0]?.items) || !hasMissingIdentity(sections)) return sections;

  const stableSections = assignMissingStableTemplateIdentities(sections);
  let sectionIndex = 0;
  return sections.map((section) => {
    if (!isRecord(section)) return section;
    const stableSection = stableSections[sectionIndex++];
    if (!Array.isArray(section.items)) return { ...section, id: stableSection.id };
    const stableItems = records(stableSection.items);
    let itemIndex = 0;
    const items = section.items.map((item) => (isRecord(item) ? withItemIds(item, stableItems[itemIndex++]) : item));
    return { ...section, id: stableSection.id, items };
  });
}

/** A stored items column with withStableTemplateIdentities applied; as stored when no id is missing. */
export function withStableItemsColumn(items: string): string {
  const { sections, error } = normalizeSectionsPayload(parseJsonArray(items) ?? []);
  if (error) return items;
  const stableSections = withStableTemplateIdentities(sections);
  return stableSections === sections ? items : JSON.stringify(stableSections);
}
