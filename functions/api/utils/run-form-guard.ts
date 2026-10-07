import {
  isFormFieldRecord,
  readTextId,
  sectionRecordsIn,
  taskRecordsIn,
  type TaskRecord,
} from '../../../src/lib/schemas/jsonRecords';
import {
  FORM_INCOMPLETE_CODE,
  findFormFieldProblems,
  type FormFieldProblemReason,
} from '../../../src/lib/schemas/formValidation';
import { getTaskFormFields } from '../../../src/lib/schemas/storedSections';
import { normalizeSectionsPayload } from './payloads';
import { jsonError } from './response';
import { getArray, mapFormBlocks } from './template-identities';

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

const isDone = (task: TaskRecord): boolean =>
  typeof task.isCompleted === 'boolean' ? task.isCompleted : task.completed === true;

export const doneTaskFormBlockers = (task: TaskRecord): FormBlockedField[] => (isDone(task) ? taskFormBlockers(task) : []);

const tasksIn = (sections: unknown[]): TaskRecord[] =>
  sectionRecordsIn(normalizeSectionsPayload(sections).sections).flatMap((section) => taskRecordsIn(section.items));

function firstTaskById(sections: unknown[]): Map<string, TaskRecord> {
  const byId = new Map<string, TaskRecord>();
  for (const task of tasksIn(sections)) {
    const id = readTextId(task.id);
    if (id !== undefined && !byId.has(id)) byId.set(id, task);
  }
  return byId;
}

function withSubmittedAnswers(stored: TaskRecord, submitted: TaskRecord): TaskRecord {
  const answers = new Map(getTaskFormFields(submitted).flatMap((field) => {
    const id = readTextId(field.id);
    return id === undefined ? [] : [[id, field.answer] as const];
  }));
  const answered = (fields: unknown[]) => fields.map((field) => {
    if (!isFormFieldRecord(field)) return field;
    const { answer, ...definition } = field;
    const id = readTextId(field.id);
    const submittedAnswer = id === undefined ? undefined : answers.get(id);
    return submittedAnswer === undefined ? definition : { ...definition, answer: submittedAnswer };
  });
  return { ...stored, contents: mapFormBlocks(getArray(stored.contents), answered) };
}

const answersOf = (task: TaskRecord): string =>
  JSON.stringify(getTaskFormFields(task).map((field) => [field.id, field.answer ?? null]));

function findFormBlockedSaves(storedSections: unknown[], nextSections: unknown[]): FormBlockedField[] {
  const storedTasks = firstTaskById(storedSections);
  return tasksIn(nextSections).flatMap((task) => {
    if (!isDone(task)) return [];
    const stored = storedTasks.get(readTextId(task.id) ?? '');
    if (!stored) return taskFormBlockers(task);
    const checked = withSubmittedAnswers(stored, task);
    const alreadyDoneWithTheseAnswers = isDone(stored) && answersOf(stored) === answersOf(checked);
    return alreadyDoneWithTheseAnswers ? [] : taskFormBlockers(checked);
  });
}

export function formIncompleteResponse(storedSections: unknown[], nextSections: unknown[]): Response | null {
  const blocked = findFormBlockedSaves(storedSections, nextSections);
  if (blocked.length === 0) return null;
  return jsonError(FORM_INCOMPLETE_MESSAGE, 409, { code: FORM_INCOMPLETE_CODE, details: formIncompleteDetails(blocked) });
}
