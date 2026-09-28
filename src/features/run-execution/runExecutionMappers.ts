import {
  calculateSectionsProgress,
  isSectionsShape,
  normalizeSections,
} from '@/lib/utils/checklistSections';
import type {
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

export const countRunExecutionItems = (
  run: ChecklistRun | null,
): {
  completed: number;
  progress: number;
  total: number;
} => {
  if (!run) {
    return { completed: 0, progress: 0, total: 0 };
  }

  let completed = 0;
  let total = 0;

  run.sections.forEach((section) => {
    section.items.forEach((item) => {
      total += 1;
      if (item.isCompleted) {
        completed += 1;
      }

      item.contents?.forEach((content) => {
        if (content.type !== 'subItems' || !content.subItems) {
          return;
        }

        content.subItems.forEach((subItem) => {
          total += 1;
          if (subItem.isCompleted) {
            completed += 1;
          }
        });
      });
    });
  });

  return {
    completed,
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    total,
  };
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
