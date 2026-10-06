import { z } from 'zod';
import { toProgressPercent } from '../../../src/lib/progress';
import { sanitizeStoredSections } from '../../../src/lib/schemas/storedSections';
import { withoutFormAnswers } from '../../../src/lib/schemas/formFields';
import {
  isContentRecord,
  isRecord,
  isSectionRecord,
  isSubTaskRecord,
  isTaskRecord,
  taskRecordsIn,
  type ChecklistNodeRecord,
  type FormFieldRecord,
  type JsonRecord,
  type SectionRecord,
  type SubTaskRecord,
  type TaskRecord,
} from '../../../src/lib/schemas/jsonRecords';
import {
  assignMissingStableTemplateIdentities,
  getArray,
  getFormFields,
  getId,
  getSubItems,
  mapFormBlocks,
  mapSubTasksBlocks,
  normalizeLegacySectionShape,
} from './template-identities';
import {
  reconcileFormFields,
  reopenWhenFormBlocks,
  retiredFormAnswersOf,
  type RetiredFormAnswerEntry,
} from './template-form-reconciliation';

export { assignMissingStableTemplateIdentities, validateStableTemplateIdentities } from './template-identities';

export type RetiredRunEntry =
  | { kind: 'section'; section: SectionRecord }
  | { kind: 'item'; sectionId: string; sectionTitle?: string; item: TaskRecord }
  | {
      kind: 'subItem';
      sectionId: string;
      itemId: string;
      itemTitle?: string;
      subItem: SubTaskRecord;
    }
  | RetiredFormAnswerEntry;

const wasCompleted = (runValue: TaskRecord | SubTaskRecord | undefined): boolean =>
  typeof runValue?.isCompleted === 'boolean' ? runValue.isCompleted : runValue?.completed === true;

function preserveRunState(templateValue: TaskRecord, runValue: TaskRecord | undefined): TaskRecord {
  const next: TaskRecord = { ...templateValue };
  next.isCompleted = wasCompleted(runValue);

  if (typeof runValue?.notes === 'string') {
    next.notes = runValue.notes;
  } else {
    delete next.notes;
  }

  return next;
}

type EarlierRetired = ReturnType<typeof createEarlierRetiredLookup>;

const storedRecord = z.record(z.unknown());
const storedRetiredWork = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), section: storedRecord }),
  z.object({ kind: z.literal('item'), item: storedRecord }),
  z.object({ kind: z.literal('subItem'), subItem: storedRecord }),
  z.object({ kind: z.literal('formAnswer'), field: storedRecord }),
]);

function retiredWorkOf(entry: unknown): { kind: RetiredRunEntry['kind']; record: ChecklistNodeRecord } | null {
  const parsed = storedRetiredWork.safeParse(entry);
  if (!parsed.success) return null;
  const work = parsed.data;
  switch (work.kind) {
    case 'section':
      return { kind: work.kind, record: work.section };
    case 'item':
      return { kind: work.kind, record: work.item };
    case 'subItem':
      return { kind: work.kind, record: work.subItem };
    case 'formAnswer':
      return { kind: work.kind, record: work.field };
  }
}

function createEarlierRetiredLookup(previousRetired: unknown[]) {
  const remaining: JsonRecord[] = previousRetired.filter(isRecord);
  const take = (kind: RetiredRunEntry['kind'], id: string): ChecklistNodeRecord | undefined => {
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const work = retiredWorkOf(remaining[index]);
      if (work?.kind !== kind) continue;
      if (getId(work.record) === id) {
        remaining.splice(index, 1);
        return work.record;
      }
    }
    return undefined;
  };
  return { take, remaining };
}

function freshRunState(value: TaskRecord): TaskRecord {
  const { completed, ...next } = preserveRunState(value, undefined);
  return next;
}

const resetSubItems = (subItems: unknown[]): unknown[] =>
  subItems.map((subItem) => (isSubTaskRecord(subItem) ? freshRunState(subItem) : subItem));

function resetTaskState(item: unknown): unknown {
  if (!isTaskRecord(item)) return item;

  const next = freshRunState(item);
  if (Array.isArray(item.subItems)) next.subItems = resetSubItems(item.subItems);
  if (Array.isArray(item.contents)) {
    next.contents = mapFormBlocks(item.contents.map((content: unknown) => (
      isContentRecord(content) && Array.isArray(content.subItems)
        ? { ...content, subItems: resetSubItems(content.subItems) }
        : content
    )), withoutFormAnswers);
  }
  return next;
}

export function resetRunCompletionState(sections: unknown[]): unknown[] {
  return sections.map((section) => (
    isSectionRecord(section) && Array.isArray(section.items)
      ? { ...section, items: section.items.map(resetTaskState) }
      : section
  ));
}

function indexById<Work extends ChecklistNodeRecord>(records: Work[]): Map<string, Work[]> {
  const index = new Map<string, Work[]>();
  for (const record of records) {
    const id = getId(record);
    const copies = id ? index.get(id) : undefined;
    if (copies) copies.push(record);
    else if (id) index.set(id, [record]);
  }
  return index;
}

function createRunMatcher(kind: 'item' | 'subItem' | 'formAnswer', previous: ChecklistNodeRecord[], earlierRetired: EarlierRetired) {
  const claimed = new Set<JsonRecord>();
  const anywhere = indexById(previous);
  const claimFirst = (copies: ChecklistNodeRecord[] | undefined) => {
    const copy = copies?.find((record) => !claimed.has(record));
    if (copy) claimed.add(copy);
    return copy;
  };
  return {
    claimed,
    underParent: (id: string | null, previousUnderParentById: Map<string, ChecklistNodeRecord[]>) =>
      (id ? claimFirst(previousUnderParentById.get(id)) : undefined),
    elsewhere: (id: string | null): ChecklistNodeRecord | undefined => {
      if (!id) return undefined;
      const copies = anywhere.get(id);
      if (!copies) return earlierRetired.take(kind, id);
      return copies.length === 1 ? claimFirst(copies) : undefined;
    },
  };
}

type RunMatcher = ReturnType<typeof createRunMatcher>;

function withoutClaimed(records: unknown, claimed: Set<JsonRecord>): unknown[] {
  return getArray(records).filter((record) => !(isRecord(record) && claimed.has(record)));
}

function withoutMovedSubItems(item: TaskRecord, claimed: Set<JsonRecord>, claimedFields: Set<JsonRecord>): TaskRecord {
  const movedSubItems = getSubItems(item).some((subItem) => claimed.has(subItem));
  const movedFields = getFormFields(item).some((field) => claimedFields.has(field));
  if (!movedSubItems && !movedFields) return item;
  const contents = mapSubTasksBlocks(getArray(item.contents), (list) => withoutClaimed(list, claimed));
  return { ...item, contents: mapFormBlocks(contents, (list) => withoutClaimed(list, claimedFields)) };
}

function withoutMovedWork(section: SectionRecord, items: RunMatcher, subItems: RunMatcher, fields: RunMatcher): SectionRecord | null {
  const previousItems = getArray(section.items);
  const kept = withoutClaimed(previousItems, items.claimed)
    .map((item) => (isTaskRecord(item) ? withoutMovedSubItems(item, subItems.claimed, fields.claimed) : item));
  if (previousItems.length > 0 && kept.length === 0) return null;
  return kept.every((item, index) => item === previousItems[index]) && kept.length === previousItems.length
    ? section
    : { ...section, items: kept };
}

function reconcileItem(
  templateItem: TaskRecord,
  previousItem: TaskRecord | undefined,
  subItemMatches: Map<JsonRecord, TaskRecord | undefined>,
  fieldMatches: Map<JsonRecord, FormFieldRecord | undefined>,
): TaskRecord {
  const next = preserveRunState(templateItem, previousItem);
  const reconcileSubItems = (list: unknown[]) =>
    list.filter(isSubTaskRecord).map((subItem) => preserveRunState(subItem, subItemMatches.get(subItem)));

  if (Array.isArray(templateItem.contents)) {
    next.contents = reconcileFormFields(mapSubTasksBlocks(templateItem.contents, reconcileSubItems), fieldMatches);
  }

  const reconciledSubItems = getSubItems(next);
  if (reconciledSubItems.length > 0) {
    next.isCompleted = reconciledSubItems.every((subItem) => subItem.isCompleted === true);
  }

  return reopenWhenFormBlocks(next);
}

export function reconcileRunSections(
  previousSections: unknown[],
  templateSections: unknown[],
  previousRetired: unknown[],
): { sections: SectionRecord[]; retired: JsonRecord[]; newlyRetired: RetiredRunEntry[] } {
  const previousSectionShape = normalizeLegacySectionShape(previousSections);
  const templateSectionShape = sanitizeStoredSections(normalizeLegacySectionShape(templateSections));
  const normalizedPreviousSections = assignMissingStableTemplateIdentities(previousSectionShape);
  const normalizedTemplateSections = assignMissingStableTemplateIdentities(
    templateSectionShape,
    previousSectionShape,
  );
  const earlierRetired = createEarlierRetiredLookup(previousRetired);
  const previousById = new Map(
    normalizedPreviousSections.flatMap((section) => {
      const id = getId(section);
      return id ? [[id, section] as const] : [];
    }),
  );
  const previousItems = normalizedPreviousSections.flatMap((section) => taskRecordsIn(section.items));
  const items = createRunMatcher('item', previousItems, earlierRetired);
  const subItems = createRunMatcher('subItem', previousItems.flatMap(getSubItems), earlierRetired);
  const fields = createRunMatcher('formAnswer', previousItems.flatMap(getFormFields), earlierRetired);

  const matchedSections = normalizedTemplateSections.map((templateSection) => {
    const id = getId(templateSection) ?? '';
    const previous: SectionRecord | undefined = previousById.get(id) ?? earlierRetired.take('section', id);
    const previousItems = taskRecordsIn(previous?.items);
    return { templateSection, id, previousItems, parent: indexById(previousItems) };
  });
  const templateItems = matchedSections.flatMap(({ templateSection, parent }) =>
    taskRecordsIn(templateSection.items).map((templateItem) => ({ templateItem, parent })));

  const itemMatches = new Map<JsonRecord, TaskRecord | undefined>();
  for (const { templateItem, parent } of templateItems) {
    itemMatches.set(templateItem, items.underParent(getId(templateItem), parent));
  }
  for (const { templateItem } of templateItems) {
    if (!itemMatches.get(templateItem)) itemMatches.set(templateItem, items.elsewhere(getId(templateItem)));
  }
  const subItemMatches = new Map<JsonRecord, TaskRecord | undefined>();
  for (const { templateItem } of templateItems) {
    const previousItem = itemMatches.get(templateItem);
    const parent = indexById(previousItem ? getSubItems(previousItem) : []);
    for (const subItem of getSubItems(templateItem)) {
      subItemMatches.set(subItem, subItems.underParent(getId(subItem), parent));
    }
  }
  for (const { templateItem } of templateItems) {
    for (const subItem of getSubItems(templateItem)) {
      if (!subItemMatches.get(subItem)) subItemMatches.set(subItem, subItems.elsewhere(getId(subItem)));
    }
  }
  const fieldMatches = new Map<JsonRecord, FormFieldRecord | undefined>();
  for (const { templateItem } of templateItems) {
    const previousItem = itemMatches.get(templateItem);
    const parent = indexById(previousItem ? getFormFields(previousItem) : []);
    for (const field of getFormFields(templateItem)) fieldMatches.set(field, fields.underParent(getId(field), parent));
  }
  for (const { templateItem } of templateItems) {
    for (const field of getFormFields(templateItem)) {
      if (!fieldMatches.get(field)) fieldMatches.set(field, fields.elsewhere(getId(field)));
    }
  }

  const retired: RetiredRunEntry[] = [];
  const sections = matchedSections.map(({ templateSection, id: sectionId, previousItems: sectionPreviousItems }) => {
    const sectionItems = taskRecordsIn(templateSection.items).map((templateItem) => {
      const previousItem = itemMatches.get(templateItem);
      for (const subItem of previousItem ? getSubItems(previousItem) : []) {
        if (subItems.claimed.has(subItem) || !getId(subItem)) continue;
        retired.push({
          kind: 'subItem',
          sectionId,
          itemId: getId(templateItem) ?? '',
          ...(typeof templateItem.title === 'string' ? { itemTitle: templateItem.title } : {}),
          subItem,
        });
      }
      retired.push(...retiredFormAnswersOf(sectionId, templateItem, previousItem, fields.claimed, fieldMatches));
      return reconcileItem(templateItem, previousItem, subItemMatches, fieldMatches);
    });

    for (const previousItem of sectionPreviousItems) {
      if (items.claimed.has(previousItem) || !getId(previousItem)) continue;
      retired.push({
        kind: 'item',
        sectionId,
        ...(typeof templateSection.title === 'string' ? { sectionTitle: templateSection.title } : {}),
        item: withoutMovedSubItems(previousItem, subItems.claimed, fields.claimed),
      });
    }

    return { ...templateSection, items: sectionItems };
  });

  const retainedSectionIds = new Set(matchedSections.map(({ id }) => id));
  for (const previousSection of normalizedPreviousSections) {
    const sectionId = getId(previousSection);
    if (!sectionId || retainedSectionIds.has(sectionId)) continue;
    const section = withoutMovedWork(previousSection, items, subItems, fields);
    if (section) retired.push({ kind: 'section', section });
  }

  return { sections, retired: [...earlierRetired.remaining, ...retired], newlyRetired: retired };
}

export type RetiredRunSummary = { kind: RetiredRunEntry['kind']; id: string; title: string };

const retiredEntryTitle = (entry: RetiredRunEntry): unknown => {
  switch (entry.kind) {
    case 'section':
      return entry.section.title;
    case 'item':
      return entry.item.title;
    case 'subItem':
      return entry.subItem.title;
    case 'formAnswer':
      return entry.field.label;
  }
};

const retiredEntryRecord = (entry: RetiredRunEntry): ChecklistNodeRecord =>
  entry.kind === 'section' ? entry.section : entry.kind === 'item' ? entry.item : entry.kind === 'subItem' ? entry.subItem : entry.field;

export function summarizeRetiredEntries(entries: RetiredRunEntry[]): RetiredRunSummary[] {
  return entries.map((entry) => {
    const title = retiredEntryTitle(entry);
    return { kind: entry.kind, id: getId(retiredEntryRecord(entry)) ?? '', title: typeof title === 'string' ? title : '' };
  });
}

export function calculateRunProgress(sections: unknown[]): number {
  let completed = 0;
  let total = 0;

  for (const section of sections.filter(isSectionRecord)) {
    for (const item of taskRecordsIn(section.items)) {
      total += 1;
      if (item.isCompleted === true) completed += 1;

      for (const subItem of getSubItems(item)) {
        total += 1;
        if (subItem.isCompleted === true) completed += 1;
      }
    }
  }

  return toProgressPercent(completed, total);
}

export function findOpenRunTasks(sections: unknown[]): { total: number; open: string[] } {
  let total = 0;
  const open: string[] = [];
  for (const section of sections.filter(isSectionRecord)) {
    for (const item of taskRecordsIn(section.items)) {
      total += 1;
      if (!wasCompleted(item) || getSubItems(item).some((subItem) => !wasCompleted(subItem))) {
        open.push(getId(item) ?? '');
      }
    }
  }
  return { total, open };
}

export function findNonObjectTemplateEntry(sections: unknown[]): string | null {
  for (const [sectionIndex, section] of sections.entries()) {
    const where = `section ${sectionIndex + 1}`;
    if (!isSectionRecord(section)) return `Section ${sectionIndex + 1} must be an object`;
    for (const [itemIndex, item] of getArray(section.items).entries()) {
      const task = `task ${itemIndex + 1} in ${where}`;
      if (!isTaskRecord(item)) return `Task ${itemIndex + 1} in ${where} must be an object with a title`;
      const contents = getArray(item.contents);
      const contentIndex = contents.findIndex((content) => !isRecord(content));
      if (contentIndex >= 0) return `Content block ${contentIndex + 1} of ${task} must be an object`;
      const subItemLists = [item.subItems, ...contents.map((content) => (isContentRecord(content) ? content.subItems : undefined))];
      for (const subItems of subItemLists) {
        const subItemIndex = getArray(subItems).findIndex((subItem) => !isRecord(subItem));
        if (subItemIndex >= 0) return `Sub-task ${subItemIndex + 1} of ${task} must be an object with a title`;
      }
    }
  }
  return null;
}
