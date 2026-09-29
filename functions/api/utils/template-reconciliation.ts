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

// Runs saved before isCompleted existed store `completed`; the client reads it the same way.
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

// Work an earlier reconcile retired comes back with its run state when the Template brings
// its id back (for example, restoring an older Template version). A live copy wins; the
// newest retired copy of an id is used first.
function createEarlierRetiredLookup(previousRetired: unknown[]) {
  const remaining = previousRetired.filter(isRecord) as RetiredRunEntry[];
  const take = (kind: RetiredRunEntry['kind'], id: string): JsonRecord | undefined => {
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const entry = remaining[index];
      if (entry.kind !== kind) continue;
      const record = entry.kind === 'section' ? entry.section : entry.kind === 'item' ? entry.item : entry.subItem;
      if (isRecord(record) && getId(record) === id) {
        remaining.splice(index, 1);
        return record;
      }
    }
    return undefined;
  };
  return { take, remaining };
}

function freshRunState(value: JsonRecord): JsonRecord {
  // Clients still read the legacy `completed` key when `isCompleted` is missing.
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

/**
 * Sections for a new run started from a template. Every task and Sub-task (direct
 * `subItems` and Sub-tasks blocks in `contents`) starts unticked, and run-only state a stored
 * template may carry (`notes`, the legacy `completed` key) is dropped, as reconciliation
 * treats it. Sections, other content blocks, and non-record entries are left as they are.
 * Every path that starts a run from a template (web create, MCP start_run) uses this one
 * reset, so the same template always starts the same way.
 */
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

// Matches Template records to the run's previous copies by id. Template ids are unique across
// the whole Template, so a task or Sub-task that moved to another section or task is still the
// same work. The copy under the same parent is tried first (legacy runs repeat ids across
// sections), then the only copy anywhere in the run; an id the run holds more than once is
// never guessed. Work an earlier reconcile retired comes back only for an id the run no longer
// holds anywhere, so a stale retired copy never replaces live state.
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
    // `parent`: the previous copies under the same section or task, by id.
    underParent: (id: string | null, parent: Map<string, JsonRecord[]>) => (id ? claimFirst(parent.get(id)) : undefined),
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

// A retired task without the Sub-tasks that moved to another task.
function withoutMovedSubItems(item: JsonRecord, claimed: Set<JsonRecord>): JsonRecord {
  if (!getSubItems(item).some((subItem) => claimed.has(subItem))) return item;
  return { ...item, contents: mapSubTasksBlocks(getArray(item.contents), (list) => withoutClaimed(list, claimed)) };
}

// A removed section without the tasks and Sub-tasks that moved elsewhere; null when every
// task it had moved, so nothing of its run state is left to keep.
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

  // A task is complete exactly when all its Sub-tasks are, the rule the run page and Run
  // Keys follow. So a new Sub-task (which arrives incomplete) reopens the task, and removing
  // the last unfinished one completes it. A task left without Sub-tasks keeps its run state.
  const reconciledSubItems = getSubItems(next);
  if (reconciledSubItems.length > 0) {
    next.isCompleted = reconciledSubItems.every((subItem) => subItem.isCompleted === true);
  }

  return next;
}

/**
 * Applies the Template's sections to a run, keeping run state by stable id, also for work
 * that moved to another section or task. Removed work moves to `retired` (earlier entries
 * first); `newlyRetired` is what this call retired.
 */
export function reconcileRunSections(
  previousSections: unknown[],
  templateSections: unknown[],
  previousRetired: unknown[],
): { sections: JsonRecord[]; retired: RetiredRunEntry[]; newlyRetired: RetiredRunEntry[] } {
  const previousSectionShape = normalizeLegacySectionShape(previousSections);
  // A Template stored before content was checked must not copy malformed blocks into runs.
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

  // Each section keeps its own previous copy (or one an earlier reconcile retired).
  const matchedSections = normalizedTemplateSections.map((templateSection) => {
    const id = getId(templateSection) ?? '';
    const previous = previousById.get(id) ?? earlierRetired.take('section', id);
    const previousItems = getArray(previous?.items).filter(isRecord);
    return { templateSection, id, previousItems, parent: indexById(previousItems) };
  });
  const templateItems = matchedSections.flatMap(({ templateSection, parent }) =>
    getArray(templateSection.items).filter(isRecord).map((templateItem) => ({ templateItem, parent })));

  // Every copy under the same parent is matched before any is looked for elsewhere, so the
  // result does not depend on which way work moved.
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

  // Previous work nothing in the Template matched is retired.
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
          itemTitle: typeof templateItem.title === 'string' ? templateItem.title : undefined,
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
        sectionTitle: typeof templateSection.title === 'string' ? templateSection.title : undefined,
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

/** Names retired work by kind, id and title (never notes), for a run's audit event. */
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

/**
 * A run's tasks, and the ids of those that keep it from being completed: a task that is not
 * ticked, or one with a Sub-task (a row of its Sub-tasks blocks) that is not. A run can be
 * completed once it has tasks and none is open, the rule the run page's Complete run follows
 * (canFinishRun, which tests/unit/functions/api/run-completion-rule.test.ts keeps in step).
 * Runs saved before isCompleted existed store `completed`, read the same way.
 */
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

// Import refuses a section, task, content block or sub-task that is not an object. The
// identity pass would silently drop it, and a client that spread a string into a record
// would store its characters as keys on an untitled task.
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
