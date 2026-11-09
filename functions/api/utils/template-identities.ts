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

const SECTION_WITHOUT_ID = 'Every template section requires a stable id';
const itemWithoutId = (sectionId: string) => `Every item in section ${sectionId} requires a stable id`;

export function validateStableTemplateIdentities(sections: unknown[]): string | null {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const subItemIds = new Set<string>();
  const fieldIds = new Set<string>();

  for (const section of sections) {
    if (!isSectionRecord(section)) return SECTION_WITHOUT_ID;
    const sectionId = getId(section);
    if (!sectionId) return SECTION_WITHOUT_ID;
    if (sectionIds.has(sectionId)) return `Duplicate section id: ${sectionId}`;
    sectionIds.add(sectionId);

    for (const item of getArray(section.items)) {
      if (!isTaskRecord(item)) return itemWithoutId(sectionId);
      const itemId = getId(item);
      if (!itemId) return itemWithoutId(sectionId);
      if (itemIds.has(itemId)) return `Duplicate item id: ${itemId}`;
      itemIds.add(itemId);

      for (const subItem of getSubItems(item)) {
        const subItemId = getId(subItem);
        if (!subItemId) return `Every sub-item in item ${itemId} requires a stable id`;
        if (subItemIds.has(subItemId)) return `Duplicate sub-item id: ${subItemId}`;
        subItemIds.add(subItemId);
      }

      for (const field of getFormFields(item)) {
        const fieldId = getId(field);
        if (!fieldId) return `Every form field in item ${itemId} requires a stable id`;
        if (fieldIds.has(fieldId)) return `Duplicate form field id: ${fieldId}`;
        fieldIds.add(fieldId);
      }
    }
  }

  return null;
}

type LegacyIdKind = 'section' | 'item' | 'subitem' | 'field';

type Sibling<Node extends ChecklistNodeRecord> = { record: Node; index: number; place: string; id: string };

const placeOf = (parentPlace: string | null, index: number): string =>
  parentPlace === null ? `${index + 1}` : `${parentPlace}-${index + 1}`;

const ownOrLegacyId = (record: ChecklistNodeRecord, kind: LegacyIdKind, place: string): string =>
  getId(record) ?? `legacy-${kind}-${place}`;

const siblingsOf = <Node extends ChecklistNodeRecord>(records: Node[], kind: LegacyIdKind, parentPlace: string | null): Sibling<Node>[] =>
  records.map((record, index) => {
    const place = placeOf(parentPlace, index);
    return { record, index, place, id: ownOrLegacyId(record, kind, place) };
  });

const childSiblingsOf = <Parent extends ChecklistNodeRecord, Child extends ChecklistNodeRecord>(
  parent: Sibling<Parent> | null,
  childrenOf: (record: Parent) => Child[],
  kind: LegacyIdKind,
): Sibling<Child>[] => (parent ? siblingsOf(childrenOf(parent.record), kind, parent.place) : []);

type SiblingMatch<Node extends ChecklistNodeRecord> = { current: Sibling<Node>; id: string; previous: Sibling<Node> | null };

function matchSiblingIdentities<Node extends ChecklistNodeRecord>(current: Sibling<Node>[], previous: Sibling<Node>[]): SiblingMatch<Node>[] {
  const matches = current.map(
    (sibling): { current: Sibling<Node>; id?: string; previous: Sibling<Node> | null } => ({ current: sibling, previous: null }),
  );
  const usedPrevious = new Set<number>();

  matches.forEach((match) => {
    const currentId = getId(match.current.record);
    if (!currentId) return;
    const candidate = previous.find((sibling) => !usedPrevious.has(sibling.index) && sibling.id === currentId);
    if (!candidate) return;
    match.id = currentId;
    match.previous = candidate;
    usedPrevious.add(candidate.index);
  });

  matches.forEach((match) => {
    if (match.id) return;
    const title = typeof match.current.record.title === 'string' ? match.current.record.title : null;
    if (!title || current.filter((sibling) => sibling.record.title === title).length !== 1) return;
    const candidates = previous.filter((sibling) => !usedPrevious.has(sibling.index) && sibling.record.title === title);
    const [candidate] = candidates;
    if (candidate === undefined || candidates.length !== 1 || getId(candidate.record)) return;
    match.id = candidate.id;
    match.previous = candidate;
    usedPrevious.add(candidate.index);
  });

  return matches.map((match, currentIndex) => {
    if (match.id) return { current: match.current, id: match.id, previous: match.previous };
    const atPlace = previous[currentIndex];
    if (atPlace && !usedPrevious.has(currentIndex) && !getId(atPlace.record)) {
      usedPrevious.add(currentIndex);
      return { current: match.current, id: atPlace.id, previous: atPlace };
    }
    return { current: match.current, id: match.current.id, previous: null };
  });
}

const idsByRecord = <Node extends ChecklistNodeRecord>(matches: SiblingMatch<Node>[]): Map<Node, string> =>
  new Map(matches.map(({ current, id }) => [current.record, id]));

type StableTask = TaskRecord & { id: string };
export type StableSection = SectionRecord & { id: string; items: StableTask[] };

function assignIdentities(sections: SectionRecord[], previousSections: SectionRecord[]): StableSection[] {
  const sectionMatches = matchSiblingIdentities(siblingsOf(sections, 'section', null), siblingsOf(previousSections, 'section', null));

  return sectionMatches.map(({ current: section, id: sectionId, previous: previousSection }) => {
    const itemMatches = matchSiblingIdentities(
      siblingsOf(taskRecordsIn(section.record.items), 'item', section.place),
      childSiblingsOf(previousSection, (record) => taskRecordsIn(record.items), 'item'),
    );

    return {
      ...section.record,
      id: sectionId,
      items: itemMatches.map(({ current: item, id: itemId, previous: previousItem }) => {
        const subItemIds = idsByRecord(matchSiblingIdentities(
          siblingsOf(getSubItems(item.record), 'subitem', item.place),
          childSiblingsOf(previousItem, getSubItems, 'subitem'),
        ));
        const fieldIds = idsByRecord(matchSiblingIdentities(
          siblingsOf(getFormFields(item.record), 'field', item.place),
          childSiblingsOf(previousItem, getFormFields, 'field'),
        ));
        const assignSubItems = (subItems: unknown[]) =>
          subItems.filter(isSubTaskRecord).map((subItem) => ({ ...subItem, id: subItemIds.get(subItem) }));
        const assignFields = (fields: unknown[]) =>
          fields.filter(isFormFieldRecord).map((field) => withOptionIds({ ...field, id: fieldIds.get(field) }));

        return {
          ...item.record,
          id: itemId,
          ...(Array.isArray(item.record.contents)
            ? { contents: mapFormBlocks(mapSubTasksBlocks(item.record.contents, assignSubItems), assignFields) }
            : {}),
        };
      }),
    };
  });
}

export function assignMissingStableTemplateIdentities(
  sections: unknown[],
  previousSections: unknown[] = [],
): StableSection[] {
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

function withItemIds(item: TaskRecord, place: string): TaskRecord {
  let subItemIndex = 0;
  const withIds = (subItems: unknown[]) => subItems.map((subItem) =>
    isRecord(subItem) ? { ...subItem, id: ownOrLegacyId(subItem, 'subitem', placeOf(place, subItemIndex++)) } : subItem);
  let fieldIndex = 0;
  const withFieldIds = (fields: unknown[]) => fields.map((field) =>
    isFormFieldRecord(field) ? withOptionIds({ ...field, id: ownOrLegacyId(field, 'field', placeOf(place, fieldIndex++)) }) : field);
  return {
    ...item,
    id: ownOrLegacyId(item, 'item', place),
    ...(Array.isArray(item.contents)
      ? { contents: mapFormBlocks(mapSubTasksBlocks(item.contents, withIds), withFieldIds) }
      : {}),
  };
}

export function withStableTemplateIdentities(sections: unknown[]): unknown[] {
  if (!isSectionedList(sections) || !hasMissingIdentity(sections)) return sections;

  let sectionIndex = 0;
  return sections.map((section) => {
    if (!isSectionRecord(section)) return section;
    const sectionPlace = placeOf(null, sectionIndex++);
    const id = ownOrLegacyId(section, 'section', sectionPlace);
    if (!Array.isArray(section.items)) return { ...section, id };
    let itemIndex = 0;
    const items = section.items.map((item: unknown) =>
      (isTaskRecord(item) ? withItemIds(item, placeOf(sectionPlace, itemIndex++)) : item));
    return { ...section, id, items };
  });
}

export function withStableItemsColumn(items: string): string {
  const { sections } = normalizeSectionsPayload(parseJsonArray(items) ?? []);
  const stableSections = withStableTemplateIdentities(sections);
  return stableSections === sections ? items : JSON.stringify(stableSections);
}
