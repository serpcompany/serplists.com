import { getTaskSubTasks, isSectionedList, isSubTasksBlock } from '../../../src/lib/schemas/storedSections';
import { normalizeSectionsPayload, parseJsonArray } from './payloads';

export type JsonRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getId = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') {
    return null;
  }
  return value.id;
};

export const getArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function normalizeLegacySectionShape(values: unknown[]): JsonRecord[] {
  const records = values.filter(isRecord);
  if (records.length === 0) return [];
  if (isSectionedList(values)) return records;

  return [{
    id: '1',
    title: 'Checklist',
    items: records,
  }];
}

export const getSubItems = getTaskSubTasks;

export const mapSubTasksBlocks = (contents: unknown[], mapSubItems: (subItems: unknown[]) => unknown[]): unknown[] =>
  contents.map((content) => (
    isSubTasksBlock(content) && Array.isArray(content.subItems)
      ? { ...content, subItems: mapSubItems(content.subItems) }
      : content
  ));

export function validateStableTemplateIdentities(sections: unknown[]): string | null {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const subItemIds = new Set<string>();

  for (const section of sections) {
    const sectionId = getId(section);
    if (!sectionId) return 'Every template section requires a stable id';
    if (sectionIds.has(sectionId)) return `Duplicate section id: ${sectionId}`;
    sectionIds.add(sectionId);

    for (const item of getArray((section as JsonRecord).items)) {
      const itemId = getId(item);
      if (!itemId) return `Every item in section ${sectionId} requires a stable id`;
      if (itemIds.has(itemId)) return `Duplicate item id: ${itemId}`;
      itemIds.add(itemId);

      for (const subItem of getSubItems(item as JsonRecord)) {
        const subItemId = getId(subItem);
        if (!subItemId) return `Every sub-item in item ${itemId} requires a stable id`;
        if (subItemIds.has(subItemId)) return `Duplicate sub-item id: ${subItemId}`;
        subItemIds.add(subItemId);
      }
    }
  }

  return null;
}

type SiblingMatch = { record: JsonRecord; id: string; previousIndex: number | null };

function matchSiblingIdentities(
  currentRecords: JsonRecord[],
  previousRaw: JsonRecord[],
  previousNormalized: JsonRecord[],
  fallbackId: (index: number) => string,
): SiblingMatch[] {
  const matches = currentRecords.map(
    (record): { record: JsonRecord; id?: string; previousIndex: number | null } => ({ record, previousIndex: null }),
  );
  const usedPrevious = new Set<number>();

  matches.forEach((match) => {
    const currentId = getId(match.record);
    if (!currentId) return;
    const previousIndex = previousNormalized.findIndex(
      (candidate, candidateIndex) => !usedPrevious.has(candidateIndex) && getId(candidate) === currentId,
    );
    if (previousIndex < 0) return;
    match.id = currentId;
    match.previousIndex = previousIndex;
    usedPrevious.add(previousIndex);
  });

  matches.forEach((match, currentIndex) => {
    if (match.id) return;
    const title = typeof match.record.title === 'string' ? match.record.title : null;
    if (!title || currentRecords.filter((candidate) => candidate.title === title).length !== 1) return;
    const candidates = previousRaw.flatMap((candidate, candidateIndex) =>
      !usedPrevious.has(candidateIndex) && candidate.title === title ? [candidateIndex] : []
    );
    const [previousIndex] = candidates;
    if (previousIndex === undefined || candidates.length !== 1 || getId(previousRaw[previousIndex])) return;
    match.id = getId(previousNormalized[previousIndex]) ?? fallbackId(currentIndex);
    match.previousIndex = previousIndex;
    usedPrevious.add(previousIndex);
  });

  matches.forEach((match, currentIndex) => {
    if (match.id) return;
    if (
      previousRaw[currentIndex]
      && !usedPrevious.has(currentIndex)
      && !getId(previousRaw[currentIndex])
    ) {
      match.id = getId(previousNormalized[currentIndex]) ?? fallbackId(currentIndex);
      match.previousIndex = currentIndex;
      usedPrevious.add(currentIndex);
      return;
    }
    match.id = getId(match.record) ?? fallbackId(currentIndex);
    match.previousIndex = null;
  });

  return matches.map((match, index) => ({
    record: match.record,
    id: match.id ?? fallbackId(index),
    previousIndex: match.previousIndex,
  }));
}

const previousAt = (previous: JsonRecord[], previousIndex: number | null): JsonRecord | undefined =>
  previousIndex === null ? undefined : previous[previousIndex];

function matchedIdAt(matches: SiblingMatch[], index: number): string {
  const match = matches[index];
  if (!match) throw new Error(`No id was matched for sub-item ${index + 1}`);
  return match.id;
}

function assignIdentities(sections: JsonRecord[], previousSections: JsonRecord[]): JsonRecord[] {
  const previousNormalized = previousSections.length > 0
    ? assignIdentities(previousSections, [])
    : [];
  const sectionMatches = matchSiblingIdentities(
    sections,
    previousSections,
    previousNormalized,
    (index) => `legacy-section-${index + 1}`,
  );

  return sectionMatches.map(({ record: section, id: sectionId, previousIndex: previousSectionIndex }, sectionIndex) => {
    const previousSectionRaw = previousAt(previousSections, previousSectionIndex);
    const previousSectionNormalized = previousAt(previousNormalized, previousSectionIndex);
    const previousItemsRaw = getArray(previousSectionRaw?.items).filter(isRecord);
    const previousItemsNormalized = getArray(previousSectionNormalized?.items).filter(isRecord);
    const currentItems = getArray(section.items).filter(isRecord);
    const itemMatches = matchSiblingIdentities(
      currentItems,
      previousItemsRaw,
      previousItemsNormalized,
      (index) => `legacy-item-${sectionIndex + 1}-${index + 1}`,
    );

    return {
      ...section,
      id: sectionId,
      items: itemMatches.map(({ record: item, id: itemId, previousIndex: previousItemIndex }, itemIndex) => {
        const previousItemRaw = previousAt(previousItemsRaw, previousItemIndex);
        const previousItemNormalized = previousAt(previousItemsNormalized, previousItemIndex);
        const previousSubItemsRaw = previousItemRaw ? getSubItems(previousItemRaw) : [];
        const previousSubItemsNormalized = previousItemNormalized ? getSubItems(previousItemNormalized) : [];
        const currentSubItems = getSubItems(item);
        const subItemMatches = matchSiblingIdentities(
          currentSubItems,
          previousSubItemsRaw,
          previousSubItemsNormalized,
          (index) => `legacy-subitem-${sectionIndex + 1}-${itemIndex + 1}-${index + 1}`,
        );
        let subItemSequence = 0;
        const assignSubItems = (subItems: unknown[]) => subItems.filter(isRecord).map((subItem) => ({
          ...subItem,
          id: matchedIdAt(subItemMatches, subItemSequence++),
        }));

        return {
          ...item,
          id: itemId,
          ...(Array.isArray(item.contents) ? { contents: mapSubTasksBlocks(item.contents, assignSubItems) } : {}),
        };
      }),
    };
  });
}

export function assignMissingStableTemplateIdentities(
  sections: unknown[],
  previousSections: unknown[] = [],
): JsonRecord[] {
  return assignIdentities(
    normalizeLegacySectionShape(sections),
    normalizeLegacySectionShape(previousSections),
  );
}

const hasMissingIdentity = (sections: unknown[]): boolean => sections.filter(isRecord).some((section) =>
  !getId(section) || getArray(section.items).filter(isRecord).some((item) =>
    !getId(item) || getSubItems(item).some((subItem) => !getId(subItem))));

function withItemIds(item: JsonRecord, stableItem: JsonRecord): JsonRecord {
  const subItemIds = getSubItems(stableItem).map((subItem) => subItem.id);
  let subItemIndex = 0;
  const withIds = (subItems: unknown[]) => subItems.map((subItem) =>
    isRecord(subItem) ? { ...subItem, id: subItemIds[subItemIndex++] } : subItem);
  return {
    ...item,
    id: stableItem.id,
    ...(Array.isArray(item.contents) ? { contents: mapSubTasksBlocks(item.contents, withIds) } : {}),
  };
}

export function withStableTemplateIdentities(sections: unknown[]): unknown[] {
  if (!isSectionedList(sections) || !hasMissingIdentity(sections)) return sections;

  const stableSections = assignMissingStableTemplateIdentities(sections);
  let sectionIndex = 0;
  return sections.map((section) => {
    if (!isRecord(section)) return section;
    const stableSection = stableRecordAt(stableSections, sectionIndex++, 'section');
    if (!Array.isArray(section.items)) return { ...section, id: stableSection.id };
    const stableItems = getArray(stableSection.items).filter(isRecord);
    let itemIndex = 0;
    const items = section.items.map((item: unknown) =>
      (isRecord(item) ? withItemIds(item, stableRecordAt(stableItems, itemIndex++, 'item')) : item));
    return { ...section, id: stableSection.id, items };
  });
}

function stableRecordAt(stable: JsonRecord[], index: number, kind: 'section' | 'item'): JsonRecord {
  const record = stable[index];
  if (!record) throw new Error(`Assigning stable ids returned no ${kind} at position ${index + 1}`);
  return record;
}

export function withStableItemsColumn(items: string): string {
  const { sections, error } = normalizeSectionsPayload(parseJsonArray(items) ?? []);
  if (error) return items;
  const stableSections = withStableTemplateIdentities(sections);
  return stableSections === sections ? items : JSON.stringify(stableSections);
}
