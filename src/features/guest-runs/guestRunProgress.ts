import {
  areAllRunItemsCompleted,
  areItemSubItemsCompleted,
  findRunSubItem,
} from '@/features/run-execution/runExecutionMappers';
import type { ChecklistItem, ChecklistRun } from '@/types/checklist';

const hasSubItems = (item: ChecklistItem): boolean =>
  item.contents?.some((content) => content.type === 'subItems' && (content.subItems?.length ?? 0) > 0) ?? false;

const carryTaskProgress = (task: ChecklistItem, guestTask: ChecklistItem | undefined): ChecklistItem => {
  if (!guestTask) return task;

  const contents = task.contents?.map((content, contentIndex) =>
    content.type === 'subItems'
      ? {
          ...content,
          subItems: content.subItems?.map((subItem, subItemIndex) => ({
            ...subItem,
            isCompleted:
              findRunSubItem(guestTask, { contentIndex, subItemId: subItem.id, subItemIndex })?.isCompleted === true,
          })),
        }
      : content,
  );
  const carried: ChecklistItem = {
    ...task,
    contents,
    isCompleted: guestTask.isCompleted === true,
    ...(guestTask.notes ? { notes: guestTask.notes } : {}),
  };
  return hasSubItems(carried) ? { ...carried, isCompleted: areItemSubItemsCompleted(carried) } : carried;
};

export const carryGuestRunProgress = (target: ChecklistRun, guest: ChecklistRun): ChecklistRun => {
  const guestTasks = new Map(guest.sections.flatMap((section) => section.items.map((item) => [item.id, item] as const)));
  const carried: ChecklistRun = {
    ...target,
    sections: target.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => carryTaskProgress(item, guestTasks.get(item.id))),
    })),
  };
  const completes = guest.status === 'completed' && areAllRunItemsCompleted(carried);

  return {
    ...carried,
    status: completes ? 'completed' : 'in_progress',
    completedAt: completes ? (guest.completedAt ?? new Date().toISOString()) : undefined,
  };
};
