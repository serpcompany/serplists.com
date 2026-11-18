import {
  FORM_INCOMPLETE_CODE,
  findFormFieldProblem,
  findFormFieldProblems,
  formFieldProblemMessage,
} from '@/lib/schemas/formValidation';
import type { ChecklistFormField, ChecklistItem, ChecklistRun, FormAnswer } from '@/types/checklist';

import type { RunExecutionActionResult } from './runExecutionResult';

const FORM_FIRST_MESSAGE = "Finish this task's form first.";

export const isTaskFormBlocking = (item: ChecklistItem): boolean => findFormFieldProblems(item).length > 0;

const taskFormFields = (item: ChecklistItem): ChecklistFormField[] =>
  item.contents?.flatMap((content) => (content.type === 'form' ? (content.fields ?? []) : [])) ?? [];

export const findTaskFormField = (item: ChecklistItem, fieldId: string): ChecklistFormField | undefined =>
  taskFormFields(item).find((field) => field.id === fieldId);

export const findRunFormAnswer = (run: ChecklistRun, itemId: string, fieldId: string): FormAnswer | undefined => {
  const item = run.sections.flatMap((section) => section.items).find((candidate) => candidate.id === itemId);
  return item ? findTaskFormField(item, fieldId)?.answer : undefined;
};

export const sameFormAnswer = (left: FormAnswer | undefined, right: FormAnswer | undefined): boolean =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const describeTaskFormBlock = (item: ChecklistItem): string | null => {
  const firstFieldWithId = new Map<string, ChecklistFormField>();
  for (const field of taskFormFields(item)) {
    const named = firstFieldWithId.get(field.id) ?? field;
    firstFieldWithId.set(field.id, named);
    const reason = findFormFieldProblem(field);
    if (reason) {
      const label = named.label.trim();
      return `${FORM_FIRST_MESSAGE} ${label ? `${label}: ` : ''}${formFieldProblemMessage(named, reason)}`;
    }
  }
  return null;
};

export const refuseBlockedTask = (item: ChecklistItem): RunExecutionActionResult | null => {
  const message = describeTaskFormBlock(item);
  return message ? { kind: 'error', code: FORM_INCOMPLETE_CODE, message } : null;
};
