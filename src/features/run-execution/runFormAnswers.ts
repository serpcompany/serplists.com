import {
  FORM_INCOMPLETE_CODE,
  findFormFieldProblem,
  formFieldProblemMessage,
} from '@/lib/schemas/formValidation';
import type { ChecklistFormField, ChecklistItem, ChecklistRun, FormAnswer } from '@/types/checklist';

import type { RunExecutionActionResult } from './runExecutionResult';

const FORM_FIRST_MESSAGE = "Finish this task's form first.";

const taskFormFields = (item: ChecklistItem): ChecklistFormField[] =>
  item.contents?.flatMap((content) => (content.type === 'form' ? (content.fields ?? []) : [])) ?? [];

export const isTaskFormBlocking = (item: ChecklistItem): boolean =>
  taskFormFields(item).some((field) => findFormFieldProblem(field) !== null);

export const findTaskFormField = (item: ChecklistItem, fieldId: string): ChecklistFormField | undefined =>
  taskFormFields(item).find((field) => field.id === fieldId);

export const findRunFormAnswer = (run: ChecklistRun, itemId: string, fieldId: string): FormAnswer | undefined => {
  const item = run.sections.flatMap((section) => section.items).find((candidate) => candidate.id === itemId);
  return item ? findTaskFormField(item, fieldId)?.answer : undefined;
};

export const sameFormAnswer = (left: FormAnswer | undefined, right: FormAnswer | undefined): boolean =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const describeTaskFormBlock = (item: ChecklistItem): string | null => {
  for (const field of taskFormFields(item)) {
    const reason = findFormFieldProblem(field);
    if (!reason) continue;
    const label = field.label.trim();
    return `${FORM_FIRST_MESSAGE} ${label ? `${label}: ` : ''}${formFieldProblemMessage(field, reason)}`;
  }
  return null;
};

export const refuseBlockedTask = (item: ChecklistItem): RunExecutionActionResult | null => {
  const message = describeTaskFormBlock(item);
  return message ? { kind: 'error', code: FORM_INCOMPLETE_CODE, message } : null;
};
