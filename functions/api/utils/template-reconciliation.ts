import { z } from 'zod';
import { toProgressPercent } from '../../../src/lib/progress';
import { sanitizeStoredSections } from '../../../src/lib/schemas/storedSections';
import {
  assignMissingStableTemplateIdentities,
  getArray,
  getId,
  getSubItems,
  isRecord,
  mapSubTasksBlocks,
  normalizeLegacySectionShape,
  type JsonRecord,
} from './template-identities';

export { assignMissingStableTemplateIdentities, validateStableTemplateIdentities } from './template-identities';

export type RetiredRunEntry =
  | { kind: 'section'; section: JsonRecord }
  | { kind: 'item'; sectionId: string; sectionTitle?: string; item: JsonRecord }
  | {
      kind: 'subItem';
      sectionId: string;
      itemId: string;
      itemTitle?: string;
      subItem: JsonRecord;
    };

const wasCompleted = (runValue: JsonRecord | undefined): boolean =>
  typeof runValue?.isCompleted === 'boolean' ? runValue.isCompleted : runValue?.completed === true;

function preserveRunState(templateValue: JsonRecord, runValue: JsonRecord | undefined): JsonRecord {
  const next = { ...templateValue };
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
]);

function retiredWorkOf(entry: unknown): { kind: RetiredRunEntry['kind']; record: JsonRecord } | null {
  const parsed = storedRetiredWork.safeParse(entry);
  if (!parsed.success) return null;
  const work = parsed.data;
  const record = work.kind === 'section' ? work.section : work.kind === 'item' ? work.item : work.subItem;
  return { kind: work.kind, record };
}

function createEarlierRetiredLookup(previousRetired: unknown[]) {
  const remaining: JsonRecord[] = previousRetired.filter(isRecord);
  const take = (kind: RetiredRunEntry['kind'], id: string): JsonRecord | undefined => {
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

function freshRunState(value: JsonRecord): JsonRecord {
  const { completed: _completed, ...next } = preserveRunState(value, undefined);
  return next;
}

const resetSubItems = (subItems: unknown[]): unknown[] =>
  subItems.map((subItem) => (isRecord(subItem) ? freshRunState(subItem) : subItem));

function resetTaskState(item: unknown): unknown {
  if (!isRecord(item)) return item;

  const next = freshRunState(item);
  if (Array.isArray(item.subItems)) next.subItems = resetSubItems(item.subItems);
  if (Array.isArray(item.contents)) {
    next.contents = item.contents.map((content) => (
      isRecord(content) && Array.isArray(content.subItems)
        ? { ...content, subItems: resetSubItems(content.subItems) }
        : content
    ));
  }
  return next;
}

export function resetRunCompletionState(sections: unknown[]): unknown[] {
  return sections.map((section) => (
    isRecord(section) && Array.isArray(section.items)
      ? { ...section, items: section.items.map(resetTaskState) }
      : section
  ));
}

function indexById(records: JsonRecord[]): Map<string, JsonRecord[]> {
  const index = new Map<string, JsonRecord[]>();
  for (const record of records) {
    const id = getId(record);
    const copies = id ? index.get(id) : undefined;
    if (copies) copies.push(record);
    else if (id) index.set(id, [record]);
  }
  return index;
}

function createRunMatcher(kind: 'item' | 'subItem', previous: JsonRecord[], earlierRetired: EarlierRetired) {
  const claimed = new Set<JsonRecord>();
  const anywhere = indexById(previous);
  const claimFirst = (copies: JsonRecord[] | undefined) => {
    const copy = copies?.find((record) => !claimed.has(record));
    if (copy) claimed.add(copy);
    return copy;
  };
  return {
    claimed,
    underParent: (id: string | null, previousUnderParentById: Map<string, JsonRecord[]>) =>
      (id ? claimFirst(previousUnderParentById.get(id)) : undefined),
    elsewhere: (id: string | null) => {
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

function withoutMovedSubItems(item: JsonRecord, claimed: Set<JsonRecord>): JsonRecord {
  if (!getSubItems(item).some((subItem) => claimed.has(subItem))) return item;
  return { ...item, contents: mapSubTasksBlocks(getArray(item.contents), (list) => withoutClaimed(list, claimed)) };
}

function withoutMovedWork(section: JsonRecord, items: RunMatcher, subItems: RunMatcher): JsonRecord | null {
  const previousItems = getArray(section.items);
  const kept = withoutClaimed(previousItems, items.claimed)
    .map((item) => (isRecord(item) ? withoutMovedSubItems(item, subItems.claimed) : item));
  if (previousItems.length > 0 && kept.length === 0) return null;
  return kept.every((item, index) => item === previousItems[index]) && kept.length === previousItems.length
    ? section
    : { ...section, items: kept };
}

function reconcileItem(
  templateItem: JsonRecord,
  previousItem: JsonRecord | undefined,
  subItemMatches: Map<JsonRecord, JsonRecord | undefined>,
): JsonRecord {
  const next = preserveRunState(templateItem, previousItem);
  const reconcileSubItems = (list: unknown[]) =>
    list.filter(isRecord).map((subItem) => preserveRunState(subItem, subItemMatches.get(subItem)));

  if (Array.isArray(templateItem.contents)) next.contents = mapSubTasksBlocks(templateItem.contents, reconcileSubItems);

  const reconciledSubItems = getSubItems(next);
  if (reconciledSubItems.length > 0) {
    next.isCompleted = reconciledSubItems.every((subItem) => subItem.isCompleted === true);
  }

  return next;
}

export function reconcileRunSections(
  previousSections: unknown[],
  templateSections: unknown[],
  previousRetired: unknown[],
): { sections: JsonRecord[]; retired: JsonRecord[]; newlyRetired: RetiredRunEntry[] } {
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
  const previousItems = normalizedPreviousSections.flatMap((section) => getArray(section.items).filter(isRecord));
  const items = createRunMatcher('item', previousItems, earlierRetired);
  const subItems = createRunMatcher('subItem', previousItems.flatMap(getSubItems), earlierRetired);

  const matchedSections = normalizedTemplateSections.map((templateSection) => {
    const id = getId(templateSection) ?? '';
    const previous = previousById.get(id) ?? earlierRetired.take('section', id);
    const previousItems = getArray(previous?.items).filter(isRecord);
    return { templateSection, id, previousItems, parent: indexById(previousItems) };
  });
  const templateItems = matchedSections.flatMap(({ templateSection, parent }) =>
    getArray(templateSection.items).filter(isRecord).map((templateItem) => ({ templateItem, parent })));

  const itemMatches = new Map<JsonRecord, JsonRecord | undefined>();
  for (const { templateItem, parent } of templateItems) {
    itemMatches.set(templateItem, items.underParent(getId(templateItem), parent));
  }
  for (const { templateItem } of templateItems) {
    if (!itemMatches.get(templateItem)) itemMatches.set(templateItem, items.elsewhere(getId(templateItem)));
  }
  const subItemMatches = new Map<JsonRecord, JsonRecord | undefined>();
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

  const retired: RetiredRunEntry[] = [];
  const sections = matchedSections.map(({ templateSection, id: sectionId, previousItems: sectionPreviousItems }) => {
    const sectionItems = getArray(templateSection.items).filter(isRecord).map((templateItem) => {
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
      return reconcileItem(templateItem, previousItem, subItemMatches);
    });

    for (const previousItem of sectionPreviousItems) {
      if (items.claimed.has(previousItem) || !getId(previousItem)) continue;
      retired.push({
        kind: 'item',
        sectionId,
        ...(typeof templateSection.title === 'string' ? { sectionTitle: templateSection.title } : {}),
        item: withoutMovedSubItems(previousItem, subItems.claimed),
      });
    }

    return { ...templateSection, items: sectionItems };
  });

  const retainedSectionIds = new Set(matchedSections.map(({ id }) => id));
  for (const previousSection of normalizedPreviousSections) {
    const sectionId = getId(previousSection);
    if (!sectionId || retainedSectionIds.has(sectionId)) continue;
    const section = withoutMovedWork(previousSection, items, subItems);
    if (section) retired.push({ kind: 'section', section });
  }

  return { sections, retired: [...earlierRetired.remaining, ...retired], newlyRetired: retired };
}

export type RetiredRunSummary = { kind: RetiredRunEntry['kind']; id: string; title: string };

export function summarizeRetiredEntries(entries: RetiredRunEntry[]): RetiredRunSummary[] {
  return entries.map((entry) => {
    const record = entry.kind === 'section' ? entry.section : entry.kind === 'item' ? entry.item : entry.subItem;
    return {
      kind: entry.kind,
      id: getId(record) ?? '',
      title: typeof record.title === 'string' ? record.title : '',
    };
  });
}

export function calculateRunProgress(sections: unknown[]): number {
  let completed = 0;
  let total = 0;

  for (const section of sections.filter(isRecord)) {
    for (const item of getArray(section.items).filter(isRecord)) {
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
  for (const section of sections.filter(isRecord)) {
    for (const item of getArray(section.items).filter(isRecord)) {
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
    if (!isRecord(section)) return `Section ${sectionIndex + 1} must be an object`;
    for (const [itemIndex, item] of getArray(section.items).entries()) {
      const task = `task ${itemIndex + 1} in ${where}`;
      if (!isRecord(item)) return `Task ${itemIndex + 1} in ${where} must be an object with a title`;
      const contents = getArray(item.contents);
      const contentIndex = contents.findIndex((content) => !isRecord(content));
      if (contentIndex >= 0) return `Content block ${contentIndex + 1} of ${task} must be an object`;
      const subItemLists = [item.subItems, ...contents.map((content) => (content as JsonRecord).subItems)];
      for (const subItems of subItemLists) {
        const subItemIndex = getArray(subItems).findIndex((subItem) => !isRecord(subItem));
        if (subItemIndex >= 0) return `Sub-task ${subItemIndex + 1} of ${task} must be an object with a title`;
      }
    }
  }
  return null;
}
