import {
  calculateSectionsProgress,
  countRunTasks,
  isSectionsShape,
  normalizeSections,
  type RunTaskCounts,
} from '@/lib/utils/checklistSections';
import type {
  ChecklistItem,
  ChecklistRun,
  ChecklistSection,
  ChecklistSubItem,
} from '@/types/checklist';
import { parseRetiredRunItems } from '@/features/run-execution/retiredRunItems';

type ApiRecord = Record<string, unknown>;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeChecklistSections = (checklist: ApiRecord): ChecklistSection[] => {
  const rawSections = Array.isArray(checklist.sections)
    ? checklist.sections
    : parseJsonArray(checklist.items);

  if (isSectionsShape(rawSections)) {
    return normalizeSections(rawSections);
  }

  return normalizeSections([
    {
      id: '1',
      title: 'Checklist',
      items: rawSections,
    },
  ]);
};

export const mapChecklistToRun = (
  checklist: ApiRecord,
  fallbackId: string,
): ChecklistRun => {
  const sections = normalizeChecklistSections(checklist);

  return {
    id: asString(checklist.id) ?? fallbackId,
    templateId: asString(checklist.template_id) ?? '',
    title: asString(checklist.title) ?? 'Checklist Run',
    status:
      checklist.status === 'completed' ? 'completed' : 'in_progress',
    progress: calculateSectionsProgress(sections),
    sections,
    startedAt:
      asString(checklist.started_at) ??
      asString(checklist.created_at) ??
      new Date().toISOString(),
    completedAt: asString(checklist.completed_at),
    userId: asString(checklist.user_id) ?? '',
    // The owning Organization decides what the viewer may do with the run.
    teamId: asString(checklist.team_id) || undefined,
    templateVersion:
      typeof checklist.template_version === 'number'
        ? checklist.template_version
        : 1,
    revision: typeof checklist.revision === 'number' ? checklist.revision : 1,
    isStale: checklist.is_stale === true,
    isPublic: checklist.is_public === true || checklist.is_public === 1,
    // Read-only: kept out of `sections`, so progress and task selection never see it.
    retiredItems: parseRetiredRunItems(checklist.retired_items),
  };
};

/**
 * Maps GET /api/checklists rows for the Runs list. A run that still fails to map is listed
 * with no tasks, so one bad row never empties the list and the run can still be deleted.
 */
export const mapChecklistRuns = (checklists: unknown): ChecklistRun[] =>
  (Array.isArray(checklists) ? checklists : []).flatMap((checklist): ChecklistRun[] => {
    if (typeof checklist !== 'object' || checklist === null || typeof (checklist as ApiRecord).id !== 'string') {
      return [];
    }
    const record = checklist as ApiRecord;
    try {
      return [mapChecklistToRun(record, record.id as string)];
    } catch (error) {
      console.error('Unable to read run content', { runId: record.id, error });
      return [mapChecklistToRun({ ...record, items: '[]', sections: undefined, retired_items: '[]' }, record.id as string)];
    }
  });

export const cloneRunSections = (
  sections: ChecklistRun['sections'],
): ChecklistRun['sections'] => normalizeSections(sections);

export const getInitialSelectedItemId = (
  run: ChecklistRun | null,
): string | null => {
  if (!run) {
    return null;
  }

  for (const section of run.sections) {
    for (const item of section.items) {
      if (!item.isCompleted) {
        return item.id;
      }
    }
  }

  return run.sections[0]?.items[0]?.id ?? null;
};

// After a task is completed, move to the next unfinished task after it, wrapping to
// earlier ones; stay on it when every task is done.
export const getNextSelectedItemId = (
  run: ChecklistRun,
  completedItemId: string,
): string => {
  const items = run.sections.flatMap((section) => section.items);
  const index = items.findIndex((item) => item.id === completedItemId);
  const next = [...items.slice(index + 1), ...items.slice(0, Math.max(index, 0))].find(
    (item) => !item.isCompleted,
  );
  return next?.id ?? completedItemId;
};

// The selection once a task toggle's save lands. Completing a task moves on from it only
// if it is still the selected task; a task the user opened while the save was in flight
// (Next, Previous, the task list) is kept. Pass the selection at the moment the save lands
// (a state updater's argument), never the one captured when the task was clicked.
export const getSelectionAfterToggle = (
  run: ChecklistRun,
  toggledItemId: string,
  currentSelectedItemId: string | null,
): string | null => {
  if (currentSelectedItemId !== toggledItemId) return currentSelectedItemId;
  const toggled = run.sections.flatMap((section) => section.items).find((item) => item.id === toggledItemId);
  return toggled?.isCompleted ? getNextSelectedItemId(run, toggledItemId) : currentSelectedItemId;
};

// Tasks and sub-tasks of the run, counted apart, with the overall progress that weights both.
export const countRunExecutionItems = (
  run: ChecklistRun | null,
): RunTaskCounts & { progress: number } => {
  const sections = run?.sections ?? [];
  return { ...countRunTasks(sections), progress: calculateSectionsProgress(sections) };
};

export const getSelectedRunItem = (
  run: ChecklistRun | null,
  itemId: string | null,
):
  | {
      item: ChecklistRun['sections'][number]['items'][number];
      section: ChecklistRun['sections'][number];
    }
  | null => {
  if (!run || !itemId) {
    return null;
  }

  for (const section of run.sections) {
    for (const item of section.items) {
      if (item.id === itemId) {
        return { item, section };
      }
    }
  }

  return null;
};

// A ticked task can still hold an unfinished Sub-task (older runs, API writes), so the
// completion prompt checks Sub-tasks too.
export const areAllRunItemsCompleted = (run: ChecklistRun): boolean =>
  run.sections.every((section) =>
    section.items.every((item) =>
      item.isCompleted &&
      (item.contents ?? []).every((content) =>
        content.type !== 'subItems' || (content.subItems ?? []).every((subItem) => subItem.isCompleted),
      ),
    ),
  );

export const setSubItemsCompletion = (
  subItems: ChecklistSubItem[] | undefined,
  isCompleted: boolean,
): ChecklistSubItem[] | undefined =>
  subItems?.map((subItem) => ({
    ...subItem,
    isCompleted,
  }));

const getItemSubItems = (item: ChecklistItem): ChecklistSubItem[] =>
  item.contents?.flatMap((content) =>
    content.type === 'subItems' ? (content.subItems ?? []) : [],
  ) ?? [];

// A task is done by its sub-tasks only when it has at least one and every one, across
// all of its Sub-tasks blocks, is ticked. Same rule as the agent API's set_subtask_completed.
export const areItemSubItemsCompleted = (item: ChecklistItem): boolean => {
  const subItems = getItemSubItems(item);
  return subItems.length > 0 && subItems.every((subItem) => subItem.isCompleted === true);
};

// True when the task and every one of its sub-tasks already have this completion, so
// setting it changes nothing.
export const itemHasCompletion = (item: ChecklistItem, isCompleted: boolean): boolean =>
  (item.isCompleted === true) === isCompleted &&
  getItemSubItems(item).every((subItem) => (subItem.isCompleted === true) === isCompleted);

// The sub-task at a block and row. When its id is given and that row now holds another
// sub-task (a reloaded run), the sub-task with that id in any block.
export const findRunSubItem = (
  item: ChecklistItem,
  at: { contentIndex: number; subItemId?: string; subItemIndex: number },
): ChecklistSubItem | undefined => {
  const content = item.contents?.[at.contentIndex];
  const candidate = content?.type === 'subItems' ? content.subItems?.[at.subItemIndex] : undefined;
  if (!at.subItemId || candidate?.id === at.subItemId) return candidate;
  return getItemSubItems(item).find((subItem) => subItem.id === at.subItemId);
};
