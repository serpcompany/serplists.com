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
import type { ApiRun } from '@/lib/schemas/apiRuns';
import { findFormFieldProblems } from '@/lib/schemas/formValidation';
import { parseJsonArray } from '@/lib/schemas/jsonArrays';
import { formatCount } from '@/lib/utils/pluralize';

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const normalizeChecklistSections = (checklist: ApiRun): ChecklistSection[] => {
  const rawSections = isArray(checklist.sections)
    ? checklist.sections
    : parseJsonArray(checklist.items) ?? [];

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
  checklist: ApiRun,
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
    createdAt: asString(checklist.created_at),
    updatedAt: asString(checklist.updated_at),
    userId: asString(checklist.user_id) ?? '',
    teamId: asString(checklist.team_id) || undefined,
    templateVersion:
      typeof checklist.template_version === 'number'
        ? checklist.template_version
        : 1,
    revision: typeof checklist.revision === 'number' ? checklist.revision : 1,
    isStale: checklist.is_stale === true,
    isPublic: checklist.is_public === true || checklist.is_public === 1,
    retiredItems: parseRetiredRunItems(checklist.retired_items),
    provenance: checklist.provenance ?? undefined,
  };
};

export const mapChecklistRuns = (checklists: ApiRun[]): ChecklistRun[] =>
  checklists.map((checklist) => {
    try {
      return mapChecklistToRun(checklist, checklist.id);
    } catch (error) {
      console.error('Unable to read run content', { runId: checklist.id, error });
      return mapChecklistToRun({ ...checklist, items: '[]', sections: undefined, retired_items: '[]' }, checklist.id);
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
      if (!isRunItemFinished(item)) {
        return item.id;
      }
    }
  }

  return run.sections[0]?.items[0]?.id ?? null;
};

export const getNextSelectedItemId = (
  run: ChecklistRun,
  completedItemId: string,
): string => {
  const items = run.sections.flatMap((section) => section.items);
  const index = items.findIndex((item) => item.id === completedItemId);
  const next = [...items.slice(index + 1), ...items.slice(0, Math.max(index, 0))].find(
    (item) => !isRunItemFinished(item),
  );
  return next?.id ?? completedItemId;
};

export const getSelectionAfterToggle = (
  run: ChecklistRun,
  toggledItemId: string,
  currentSelectedItemId: string | null,
): string | null => {
  if (currentSelectedItemId !== toggledItemId) return currentSelectedItemId;
  const toggled = run.sections.flatMap((section) => section.items).find((item) => item.id === toggledItemId);
  return toggled?.isCompleted ? getNextSelectedItemId(run, toggledItemId) : currentSelectedItemId;
};

export const countRunExecutionItems = (
  run: ChecklistRun | null,
): RunTaskCounts & { progress: number } => {
  const sections = run?.sections ?? [];
  return { ...countRunTasks(sections), progress: calculateSectionsProgress(sections) };
};

export const describeRunTaskCounts = (counts: Pick<RunTaskCounts, 'tasksCompleted' | 'tasksTotal'>): string =>
  `${counts.tasksCompleted} of ${formatCount(counts.tasksTotal, 'task')} finished`;

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

export const isRunItemFinished = (item: ChecklistItem): boolean =>
  item.isCompleted === true &&
  getItemSubItems(item).every((subItem) => subItem.isCompleted === true) &&
  findFormFieldProblems(item).length === 0;

export const areAllRunItemsCompleted = (run: ChecklistRun): boolean =>
  run.sections.every((section) => section.items.every(isRunItemFinished));

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

export const areItemSubItemsCompleted = (item: ChecklistItem): boolean => {
  const subItems = getItemSubItems(item);
  return subItems.length > 0 && subItems.every((subItem) => subItem.isCompleted === true);
};

export const itemHasCompletion = (item: ChecklistItem, isCompleted: boolean): boolean =>
  (item.isCompleted === true) === isCompleted &&
  getItemSubItems(item).every((subItem) => (subItem.isCompleted === true) === isCompleted);

export const findRunSubItem = (
  item: ChecklistItem,
  at: { contentIndex: number; subItemId?: string | undefined; subItemIndex: number },
): ChecklistSubItem | undefined => {
  const content = item.contents?.[at.contentIndex];
  const candidate = content?.type === 'subItems' ? content.subItems?.[at.subItemIndex] : undefined;
  if (!at.subItemId || candidate?.id === at.subItemId) return candidate;
  return getItemSubItems(item).find((subItem) => subItem.id === at.subItemId);
};
