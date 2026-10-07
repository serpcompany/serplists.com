import {
  isFormFieldRecord,
  type FormFieldRecord,
  type JsonRecord,
  type TaskRecord,
} from '../../../src/lib/schemas/jsonRecords';
import { findFormFieldProblems, isFormAnswerEmpty } from '../../../src/lib/schemas/formValidation';
import { getFormFields, getId, mapFormBlocks } from './template-identities';

export type RetiredFormAnswerEntry = {
  kind: 'formAnswer';
  sectionId: string;
  itemId: string;
  itemTitle?: string;
  field: FormFieldRecord;
};

type FieldMatches = Map<JsonRecord, FormFieldRecord | undefined>;

const keepsAnswer = (templateField: FormFieldRecord, previousField: FormFieldRecord | undefined): previousField is FormFieldRecord =>
  previousField !== undefined && previousField.kind === templateField.kind && !isFormAnswerEmpty(previousField.answer);

function carryAnswer(templateField: FormFieldRecord, previousField: FormFieldRecord | undefined): FormFieldRecord {
  const { answer, ...definition } = templateField;
  return keepsAnswer(templateField, previousField) ? { ...definition, answer: previousField.answer } : definition;
}

export const reconcileFormFields = (contents: unknown[], fieldMatches: FieldMatches): unknown[] =>
  mapFormBlocks(contents, (fields) => fields.filter(isFormFieldRecord).map((field) => carryAnswer(field, fieldMatches.get(field))));

export const reopenWhenFormBlocks = (task: TaskRecord): TaskRecord =>
  task.isCompleted === true && findFormFieldProblems(task).length > 0 ? { ...task, isCompleted: false } : task;

export function retiredFormAnswersOf(
  sectionId: string,
  templateItem: TaskRecord,
  previousItem: TaskRecord | undefined,
  claimed: Set<JsonRecord>,
  fieldMatches: FieldMatches,
): RetiredFormAnswerEntry[] {
  const removed = (previousItem ? getFormFields(previousItem) : [])
    .filter((field) => !claimed.has(field) && getId(field) !== null && !isFormAnswerEmpty(field.answer));
  const kindChanged = getFormFields(templateItem).flatMap((field) => {
    const previous = fieldMatches.get(field);
    return previous && previous.kind !== field.kind && !isFormAnswerEmpty(previous.answer) ? [previous] : [];
  });
  return [...removed, ...kindChanged].map((field) => ({
    kind: 'formAnswer',
    sectionId,
    itemId: getId(templateItem) ?? '',
    ...(typeof templateItem.title === 'string' ? { itemTitle: templateItem.title } : {}),
    field,
  }));
}
