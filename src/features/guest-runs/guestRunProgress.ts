import {
  areAllRunItemsCompleted,
  areItemSubItemsCompleted,
  findRunSubItem,
} from '@/features/run-execution/runExecutionMappers';
import { findTaskFormField, isTaskFormBlocking } from '@/features/run-execution/runFormAnswers';
import type { ChecklistFormField, ChecklistItem, ChecklistItemContent, ChecklistRun } from '@/types/checklist';

const hasSubItems = (item: ChecklistItem): boolean =>
  item.contents?.some((content) => content.type === 'subItems' && (content.subItems?.length ?? 0) > 0) ?? false;

const carryAnswer = (field: ChecklistFormField, guestTask: ChecklistItem): ChecklistFormField => {
  const guestField = findTaskFormField(guestTask, field.id);
  return guestField?.kind === field.kind && guestField.answer !== undefined ? { ...field, answer: guestField.answer } : field;
};

const carryContent = (content: ChecklistItemContent, contentIndex: number, guestTask: ChecklistItem): ChecklistItemContent => {
  if (content.type === 'form') {
    return { ...content, fields: content.fields?.map((field) => carryAnswer(field, guestTask)) };
  }
  if (content.type !== 'subItems') return content;
  return {
    ...content,
    subItems: content.subItems?.map((subItem, subItemIndex) => ({
      ...subItem,
      isCompleted:
        findRunSubItem(guestTask, { contentIndex, subItemId: subItem.id, subItemIndex })?.isCompleted === true,
    })),
  };
};

const carryTaskProgress = (task: ChecklistItem, guestTask: ChecklistItem | undefined): ChecklistItem => {
  if (!guestTask) return task;

  const carried: ChecklistItem = {
    ...task,
    contents: task.contents?.map((content, contentIndex) => carryContent(content, contentIndex, guestTask)),
    ...(guestTask.notes ? { notes: guestTask.notes } : {}),
  };
  const done = hasSubItems(carried) ? areItemSubItemsCompleted(carried) : guestTask.isCompleted === true;
  return { ...carried, isCompleted: done && !isTaskFormBlocking(carried) };
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
