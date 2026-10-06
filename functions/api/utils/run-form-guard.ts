import { readTextId, type TaskRecord } from '../../../src/lib/schemas/jsonRecords';
import { findFormFieldProblems, type FormFieldProblemReason } from '../../../src/lib/schemas/formValidation';

export const FORM_INCOMPLETE_MESSAGE =
  "A task's form has a required field without an answer or an answer that is not valid, so the task can't be marked done.";

const MAX_REPORTED_FORM_FIELDS = 50;

export type FormBlockedField = { taskId: string; fieldId: string; reason: FormFieldProblemReason };

export function taskFormBlockers(task: TaskRecord): FormBlockedField[] {
  const taskId = readTextId(task.id) ?? '';
  return findFormFieldProblems(task).map(({ fieldId, reason }) => ({ taskId, fieldId, reason }));
}

export function formIncompleteDetails(blocked: FormBlockedField[]): { fieldCount: number; fields: FormBlockedField[] } {
  return { fieldCount: blocked.length, fields: blocked.slice(0, MAX_REPORTED_FORM_FIELDS) };
}
