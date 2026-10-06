import {
  contentRecordsIn,
  isSectionRecord,
  isSubTaskRecord,
  isTaskRecord,
  type ChecklistNodeRecord,
  type TaskRecord,
} from '../../../src/lib/schemas/jsonRecords';
import { isSubTasksBlock } from '../../../src/lib/schemas/storedSections';
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

function setOnce(states: Map<string, boolean>, key: string, done: boolean): string {
  let unique = key;
  for (let copy = 2; states.has(unique); copy += 1) unique = `${key}#${copy}`;
  states.set(unique, done);
  return unique;
}

function completionStates(sections: unknown[]): Map<string, boolean> {
  const states = new Map<string, boolean>();
  normalizeSectionsPayload(sections).sections.forEach((section, sectionIndex) => {
    asArray(isSectionRecord(section) ? section.items : undefined).forEach((task, taskIndex) => {
      if (!isTaskRecord(task)) return;
      const taskKey = setOnce(states, textId(task) ?? `${sectionIndex + 1}-${taskIndex + 1}`, isDone(task));
      shownSubTasks(task).forEach((subTask, subTaskIndex) => {
        const subTaskId = isSubTaskRecord(subTask) ? textId(subTask) : null;
        setOnce(states, `${taskKey}\u0000${subTaskId ?? `#${subTaskIndex + 1}`}`, isDone(subTask));
      });
    });
  });
  return states;
}

function changesTaskCompletion(storedSections: unknown[], nextSections: unknown[]): boolean {
  const stored = completionStates(storedSections);
  for (const [key, done] of completionStates(nextSections)) {
    const was = stored.get(key);
    if (was !== undefined && was !== done) return true;
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
  if (!changesTaskCompletion(storedSections, nextSections)) return null;
  return jsonError(COMPLETED_RUN_FROZEN_MESSAGE, 409, { code: 'run_completed' });
}
