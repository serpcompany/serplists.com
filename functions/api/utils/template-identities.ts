import {
  formOptionRecordsIn,
  isChecklistNodeRecord,
  isFormFieldRecord,
  isRecord,
  isSectionRecord,
  isSubTaskRecord,
  isTaskRecord,
  taskRecordsIn,
  type ChecklistNodeRecord,
  type FormFieldRecord,
  type SectionRecord,
  type TaskRecord,
} from '../../../src/lib/schemas/jsonRecords';
import { withFormOptionIds } from '../../../src/lib/schemas/formFields';
import {
  getTaskFormFields,
  getTaskSubTasks,
  isFormBlock,
  isSectionedList,
  isSubTasksBlock,
} from '../../../src/lib/schemas/storedSections';
import { normalizeSectionsPayload } from './payloads';
import { parseJsonArray } from '../../../src/lib/schemas/jsonArrays';

export const getId = (value: unknown): string | null => {
  if (!isChecklistNodeRecord(value) || typeof value.id !== 'string' || value.id.trim() === '') {
    return null;
  }
  return value.id;
};

export const getArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

export function normalizeLegacySectionShape(values: unknown[]): SectionRecord[] {
  const records = values.filter(isSectionRecord);
  if (records.length === 0) return [];
  if (isSectionedList(values)) return records;

  return [{
    id: '1',
    title: 'Checklist',
    items: records,
  }];
}

export const getSubItems = getTaskSubTasks;
export const getFormFields = getTaskFormFields;

export const mapSubTasksBlocks = (contents: unknown[], mapSubItems: (subItems: unknown[]) => unknown[]): unknown[] =>
  contents.map((content) => (
    isSubTasksBlock(content) && Array.isArray(content.subItems)
      ? { ...content, subItems: mapSubItems(content.subItems) }
      : content
  ));

export const mapFormBlocks = (contents: unknown[], mapFields: (fields: unknown[]) => unknown[]): unknown[] =>
  contents.map((content) => (
    isFormBlock(content) && Array.isArray(content.fields)
      ? { ...content, fields: mapFields(content.fields) }
      : content
  ));

const withOptionIds = (field: FormFieldRecord): FormFieldRecord =>
  Array.isArray(field.options) ? { ...field, options: withFormOptionIds(formOptionRecordsIn(field.options)) } : field;

const optionsNeedIds = (field: FormFieldRecord): boolean =>
  Array.isArray(field.options) && JSON.stringify(withOptionIds(field).options) !== JSON.stringify(field.options);

export function validateStableTemplateIdentities(sections: unknown[]): string | null {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const subItemIds = new Set<string>();
  const fieldIds = new Set<string>();

  for (const section of sections) {
    const sectionId = getId(section);
    if (!sectionId) return 'Every template section requires a stable id';
    if (sectionIds.has(sectionId)) return `Duplicate section id: ${sectionId}`;
    sectionIds.add(sectionId);

    for (const item of isSectionRecord(section) ? getArray(section.items) : []) {
      const itemId = getId(item);
      if (!itemId) return `Every item in section ${sectionId} requires a stable id`;
      if (itemIds.has(itemId)) return `Duplicate item id: ${itemId}`;
      itemIds.add(itemId);

      for (const subItem of isTaskRecord(item) ? getSubItems(item) : []) {
        const subItemId = getId(subItem);
        if (!subItemId) return `Every sub-item in item ${itemId} requires a stable id`;
        if (subItemIds.has(subItemId)) return `Duplicate sub-item id: ${subItemId}`;
        subItemIds.add(subItemId);
      }

      for (const field of isTaskRecord(item) ? getFormFields(item) : []) {
        const fieldId = getId(field);
        if (!fieldId) return `Every form field in item ${itemId} requires a stable id`;
        if (fieldIds.has(fieldId)) return `Duplicate form field id: ${fieldId}`;
        fieldIds.add(fieldId);
      }
    }
  }

  return null;
}

type SiblingMatch<Sibling extends ChecklistNodeRecord> = { record: Sibling; id: string; previousIndex: number | null };

function matchSiblingIdentities<Sibling extends ChecklistNodeRecord>(
  currentRecords: Sibling[],
  previousRaw: Sibling[],
  previousNormalized: Sibling[],
  fallbackId: (index: number) => string,
): SiblingMatch<Sibling>[] {
  const matches = currentRecords.map(
    (record): { record: Sibling; id?: string; previousIndex: number | null } => ({ record, previousIndex: null }),
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

const previousAt = <Sibling>(previous: Sibling[], previousIndex: number | null): Sibling | undefined =>
  previousIndex === null ? undefined : previous[previousIndex];

function matchedIdAt(matches: SiblingMatch<ChecklistNodeRecord>[], index: number, kind: 'sub-item' | 'form field'): string {
  const match = matches[index];
  if (!match) throw new Error(`No id was matched for ${kind} ${index + 1}`);
  return match.id;
}

function assignIdentities(sections: SectionRecord[], previousSections: SectionRecord[]): SectionRecord[] {
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
    const previousItemsRaw = taskRecordsIn(previousSectionRaw?.items);
    const previousItemsNormalized = taskRecordsIn(previousSectionNormalized?.items);
    const currentItems = taskRecordsIn(section.items);
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
        const assignSubItems = (subItems: unknown[]) => subItems.filter(isSubTaskRecord).map((subItem) => ({
          ...subItem,
          id: matchedIdAt(subItemMatches, subItemSequence++, 'sub-item'),
        }));
        const fieldMatches = matchSiblingIdentities(
          getFormFields(item),
          previousItemRaw ? getFormFields(previousItemRaw) : [],
          previousItemNormalized ? getFormFields(previousItemNormalized) : [],
          (index) => `legacy-field-${sectionIndex + 1}-${itemIndex + 1}-${index + 1}`,
        );
        let fieldSequence = 0;
        const assignFields = (fields: unknown[]) => fields.filter(isFormFieldRecord).map((field) => withOptionIds({
          ...field,
          id: matchedIdAt(fieldMatches, fieldSequence++, 'form field'),
        }));

        return {
          ...item,
          id: itemId,
          ...(Array.isArray(item.contents)
            ? { contents: mapFormBlocks(mapSubTasksBlocks(item.contents, assignSubItems), assignFields) }
            : {}),
        };
      }),
    };
  });
}

export function assignMissingStableTemplateIdentities(
  sections: unknown[],
  previousSections: unknown[] = [],
): SectionRecord[] {
  return assignIdentities(
    normalizeLegacySectionShape(sections),
    normalizeLegacySectionShape(previousSections),
  );
}

const hasMissingIdentity = (sections: unknown[]): boolean => sections.filter(isSectionRecord).some((section) =>
  !getId(section) || taskRecordsIn(section.items).some((item) =>
    !getId(item)
    || getSubItems(item).some((subItem) => !getId(subItem))
    || getFormFields(item).some((field) => !getId(field) || optionsNeedIds(field))));

function withItemIds(item: TaskRecord, stableItem: TaskRecord): TaskRecord {
  const subItemIds = getSubItems(stableItem).map((subItem) => subItem.id);
  let subItemIndex = 0;
  const withIds = (subItems: unknown[]) => subItems.map((subItem) =>
    isRecord(subItem) ? { ...subItem, id: subItemIds[subItemIndex++] } : subItem);
  const stableFields = getFormFields(stableItem);
  let fieldIndex = 0;
  const withFieldIds = (fields: unknown[]) => fields.map((field) => {
    if (!isFormFieldRecord(field)) return field;
    const stable = stableFields[fieldIndex++];
    return stable ? { ...field, id: stable.id, ...(Array.isArray(field.options) ? { options: stable.options } : {}) } : field;
  });
  return {
    ...item,
    id: stableItem.id,
    ...(Array.isArray(item.contents)
      ? { contents: mapFormBlocks(mapSubTasksBlocks(item.contents, withIds), withFieldIds) }
      : {}),
  };
}

export function withStableTemplateIdentities(sections: unknown[]): unknown[] {
  if (!isSectionedList(sections) || !hasMissingIdentity(sections)) return sections;

  const stableSections = assignMissingStableTemplateIdentities(sections);
  let sectionIndex = 0;
  return sections.map((section) => {
    if (!isSectionRecord(section)) return section;
    const stableSection = stableRecordAt(stableSections, sectionIndex++, 'section');
    if (!Array.isArray(section.items)) return { ...section, id: stableSection.id };
    const stableItems = taskRecordsIn(stableSection.items);
    let itemIndex = 0;
    const items = section.items.map((item: unknown) =>
      (isTaskRecord(item) ? withItemIds(item, stableRecordAt(stableItems, itemIndex++, 'item')) : item));
    return { ...section, id: stableSection.id, items };
  });
}

function stableRecordAt<Stable>(stable: Stable[], index: number, kind: 'section' | 'item'): Stable {
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
