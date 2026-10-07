import {
  contentRecordsIn,
  isSectionRecord,
  isSubTaskRecord,
  isTaskRecord,
  type ChecklistNodeRecord,
  type TaskRecord,
} from '../../../src/lib/schemas/jsonRecords';
import { getTaskFormFields, isSubTasksBlock } from '../../../src/lib/schemas/storedSections';
import { isFormAnswerEmpty } from '../../../src/lib/schemas/formValidation';
import { normalizeSectionsPayload } from './payloads';
import { jsonError } from './response';

export const COMPLETED_RUN_FROZEN_MESSAGE = 'This run is completed, so its tasks can no longer be changed.';

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const textId = (record: ChecklistNodeRecord): string | null =>
  typeof record.id === 'string' && record.id !== '' ? record.id : null;

const isDone = (entry: unknown): boolean =>
  isSubTaskRecord(entry) && (typeof entry.isCompleted === 'boolean' ? entry.isCompleted : entry.completed === true);

const isShownSubTask = (entry: unknown): boolean =>
  isSubTaskRecord(entry) || (typeof entry === 'string' && entry.trim() !== '');

function shownSubTasks(task: TaskRecord): unknown[] {
  return contentRecordsIn(task.contents)
    .filter(isSubTasksBlock)
    .flatMap((block) => asArray(block.subItems).filter(isShownSubTask));
}

function setOnce(states: Map<string, string>, key: string, state: string): string {
  let unique = key;
  for (let copy = 2; states.has(unique); copy += 1) unique = `${key}#${copy}`;
  states.set(unique, state);
  return unique;
}

const doneState = (entry: unknown): string => (isDone(entry) ? 'done' : 'open');

const answerState = (answer: unknown): string => (isFormAnswerEmpty(answer) ? 'empty' : JSON.stringify(answer));

function runStates(sections: unknown[]): Map<string, string> {
  const states = new Map<string, string>();
  normalizeSectionsPayload(sections).sections.forEach((section, sectionIndex) => {
    asArray(isSectionRecord(section) ? section.items : undefined).forEach((task, taskIndex) => {
      if (!isTaskRecord(task)) return;
      const taskKey = setOnce(states, textId(task) ?? `${sectionIndex + 1}-${taskIndex + 1}`, doneState(task));
      shownSubTasks(task).forEach((subTask, subTaskIndex) => {
        const subTaskId = isSubTaskRecord(subTask) ? textId(subTask) : null;
        setOnce(states, `${taskKey}\u0000${subTaskId ?? `#${subTaskIndex + 1}`}`, doneState(subTask));
      });
      getTaskFormFields(task).forEach((field, fieldIndex) => {
        setOnce(states, `${taskKey}\u0000field:${textId(field) ?? `#${fieldIndex + 1}`}`, answerState(field.answer));
      });
    });
  });
  return states;
}

function changesRunState(storedSections: unknown[], nextSections: unknown[]): boolean {
  const stored = runStates(storedSections);
  for (const [key, state] of runStates(nextSections)) {
    const was = stored.get(key);
    if (was !== undefined && was !== state) return true;
  }
  return false;
}

export function completedRunTaskChangeResponse(
  run: { status: unknown },
  nextStatus: unknown,
  storedSections: unknown[],
  nextSections: unknown[],
): Response | null {
  if (run.status !== 'completed' || nextStatus === 'in_progress') return null;
  if (!changesRunState(storedSections, nextSections)) return null;
  return jsonError(COMPLETED_RUN_FROZEN_MESSAGE, 409, { code: 'run_completed' });
}
