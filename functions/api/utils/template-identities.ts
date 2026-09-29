// Stable ids for Template and run content: reading sections, tasks and Sub-tasks, checking
// that a Template's ids are unique, giving records that lack one an id (matched to the
// previous content where possible, so run state follows it), and giving stored content that
// lacks ids, when it is read, the ids a save of it stores.
import { isSectionedList } from '../../../src/lib/schemas/storedSections';
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
  // The same rule as the payload check, so a first section with items: null stays a section.
  if (isSectionedList(values)) return records;

  return [{
    id: '1',
    title: 'Checklist',
    items: records,
  }];
}

export function getSubItems(item: JsonRecord): JsonRecord[] {
  const direct = getArray(item.subItems).filter(isRecord);
  const nested = getArray(item.contents)
    .filter(isRecord)
    .flatMap((content) => getArray(content.subItems).filter(isRecord));
  return [...direct, ...nested];
}

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

function matchSiblingIdentities(
  currentRecords: JsonRecord[],
  previousRaw: JsonRecord[],
  previousNormalized: JsonRecord[],
  fallbackId: (index: number) => string,
): Array<{ id: string; previousIndex: number | null }> {
  const matches: Array<{ id?: string; previousIndex: number | null }> = currentRecords.map(() => ({ previousIndex: null }));
  const usedPrevious = new Set<number>();

  currentRecords.forEach((current, currentIndex) => {
    const currentId = getId(current);
    if (!currentId) return;
    const previousIndex = previousNormalized.findIndex(
      (candidate, candidateIndex) => !usedPrevious.has(candidateIndex) && getId(candidate) === currentId,
    );
    if (previousIndex < 0) return;
    matches[currentIndex] = { id: currentId, previousIndex };
    usedPrevious.add(previousIndex);
  });

  currentRecords.forEach((current, currentIndex) => {
    if (matches[currentIndex].id) return;
    const title = typeof current.title === 'string' ? current.title : null;
    if (!title || currentRecords.filter((candidate) => candidate.title === title).length !== 1) return;
    const candidates = previousRaw.flatMap((candidate, candidateIndex) =>
      !usedPrevious.has(candidateIndex) && candidate.title === title ? [candidateIndex] : []
    );
    if (candidates.length !== 1 || getId(previousRaw[candidates[0]])) return;
    const previousIndex = candidates[0];
    matches[currentIndex] = {
      id: getId(previousNormalized[previousIndex]) ?? fallbackId(currentIndex),
      previousIndex,
    };
    usedPrevious.add(previousIndex);
  });

  currentRecords.forEach((current, currentIndex) => {
    if (matches[currentIndex].id) return;
    if (
      previousRaw[currentIndex]
      && !usedPrevious.has(currentIndex)
      && !getId(previousRaw[currentIndex])
    ) {
      matches[currentIndex] = {
        id: getId(previousNormalized[currentIndex]) ?? fallbackId(currentIndex),
        previousIndex: currentIndex,
      };
      usedPrevious.add(currentIndex);
      return;
    }
    matches[currentIndex] = {
      id: getId(current) ?? fallbackId(currentIndex),
      previousIndex: null,
    };
  });

  return matches.map((match, index) => ({
    id: match.id ?? fallbackId(index),
    previousIndex: match.previousIndex,
  }));
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

  return sections.map((section, sectionIndex) => {
    const sectionMatch = sectionMatches[sectionIndex];
    const sectionId = sectionMatch.id;
    const previousSectionRaw = sectionMatch.previousIndex === null
      ? undefined
      : previousSections[sectionMatch.previousIndex];
    const previousSectionNormalized = sectionMatch.previousIndex === null
      ? undefined
      : previousNormalized[sectionMatch.previousIndex];
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
      items: currentItems.map((item, itemIndex) => {
        const itemMatch = itemMatches[itemIndex];
        const itemId = itemMatch.id;
        const previousItemRaw = itemMatch.previousIndex === null
          ? undefined
          : previousItemsRaw[itemMatch.previousIndex];
        const previousItemNormalized = itemMatch.previousIndex === null
          ? undefined
          : previousItemsNormalized[itemMatch.previousIndex];
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
          id: subItemMatches[subItemSequence++].id,
        }));

        return {
          ...item,
          id: itemId,
          ...(Array.isArray(item.subItems) ? { subItems: assignSubItems(item.subItems) } : {}),
          ...(Array.isArray(item.contents)
            ? {
                contents: item.contents.map((content) => {
                  if (!isRecord(content) || !Array.isArray(content.subItems)) return content;
                  return { ...content, subItems: assignSubItems(content.subItems) };
                }),
              }
            : {}),
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

// A stored task with the ids the identity pass gave it and its Sub-tasks (stableItem), in the
// order getSubItems numbers them: its own, then each block's.
function withItemIds(item: JsonRecord, stableItem: JsonRecord): JsonRecord {
  const subItemIds = getSubItems(stableItem).map((subItem) => subItem.id);
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
  // The identity pass reads a list that is not sections (isSectionedList) as a flat task
  // list; normalizeSectionsPayload has already wrapped any such stored list in one section.
  if (!isSectionedList(sections) || !hasMissingIdentity(sections)) return sections;

  const stableSections = assignMissingStableTemplateIdentities(sections);
  let sectionIndex = 0;
  return sections.map((section) => {
    if (!isRecord(section)) return section;
    const stableSection = stableSections[sectionIndex++];
    if (!Array.isArray(section.items)) return { ...section, id: stableSection.id };
    const stableItems = getArray(stableSection.items).filter(isRecord);
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
