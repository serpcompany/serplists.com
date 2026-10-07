import {
  isContentRecord,
  isRecord,
  isSectionRecord,
  isSubTaskRecord,
  isTaskRecord,
  type JsonRecord,
} from '../../../src/lib/schemas/jsonRecords';
import { getTaskFormFields } from '../../../src/lib/schemas/storedSections';
import { sha256Hex } from './crypto';
import { normalizeSectionsPayload } from './payloads';
import { parseJsonArray } from '../../../src/lib/schemas/jsonArrays';

interface AuditedRowFields extends JsonRecord {
  items?: unknown;
  retired_items?: unknown;
  share_token?: unknown;
}

const MAX_AUDIT_COLUMN_BYTES = 64 * 1024;
export const MAX_AUDIT_USER_AGENT_LENGTH = 512;
const MAX_LISTED_IDS = 50;
const REDACTED = '[redacted]';
const RUN_STATE_FIELDS = new Set(['isCompleted', 'completed', 'notes', 'answer']);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function compactAuditSnapshot<T>(value: T): T | JsonRecord {
  if (!isRecord(value)) return value;
  const { items, retired_items, share_token, ...rest } = value;
  return rest;
}

type TaskState = {
  key: string;
  completed: boolean;
  notes: unknown;
  answers: string;
  subItems: Map<string, boolean>;
  shapeWithoutRunState: string;
};

function readTasks(raw: unknown): { sections: number; tasks: Map<string, TaskState> } | null {
  const parsed = parseJsonArray(raw);
  if (!parsed) return null;
  const sections = normalizeSectionsPayload(parsed).sections;
  const tasks = new Map<string, TaskState>();
  sections.forEach((section, sectionIndex) => {
    asArray(isSectionRecord(section) ? section.items : undefined).forEach((item, itemIndex) => {
      if (!isTaskRecord(item)) return;
      const baseKey = typeof item.id === 'string' && item.id ? item.id : `${sectionIndex + 1}-${itemIndex + 1}`;
      let key = baseKey;
      for (let copy = 2; tasks.has(key); copy += 1) key = `${baseKey}#${copy}`;

      const subItems = new Map<string, boolean>();
      const subItemLists = [asArray(item.subItems), ...asArray(item.contents).map((content) => asArray(isContentRecord(content) ? content.subItems : undefined))];
      subItemLists.flat().forEach((subItem, subIndex) => {
        if (!isSubTaskRecord(subItem)) return;
        const subKey = typeof subItem.id === 'string' && subItem.id ? subItem.id : String(subIndex + 1);
        subItems.set(subKey, subItem.isCompleted === true || subItem.completed === true);
      });
      tasks.set(key, {
        key,
        completed: item.isCompleted === true || item.completed === true,
        notes: item.notes,
        answers: JSON.stringify(getTaskFormFields(item).map((field) => [field.id, field.answer ?? null])),
        subItems,
        shapeWithoutRunState: JSON.stringify(item, (name: string, entry: unknown) => (RUN_STATE_FIELDS.has(name) ? undefined : entry)),
      });
    });
  });
  return { sections: sections.length, tasks };
}

const TASK_CHANGE_KINDS = ['completed', 'reopened', 'notesChanged', 'answersChanged', 'edited', 'added', 'removed'] as const;

type TaskChangeKind = (typeof TASK_CHANGE_KINDS)[number];

type TaskChangeSummary = { sections: number; items: number; omittedIds?: number } & Partial<Record<TaskChangeKind, string[]>>;

function summarizeTaskChanges(previousRaw: unknown, nextRaw: unknown): TaskChangeSummary | { omitted: true } {
  const next = readTasks(nextRaw);
  if (!next) return { omitted: true };
  const summary: TaskChangeSummary = { sections: next.sections, items: next.tasks.size };
  const previous = previousRaw === undefined ? null : readTasks(previousRaw);
  if (!previous) return summary;

  const lists: Record<TaskChangeKind, string[]> = {
    completed: [], reopened: [], notesChanged: [], answersChanged: [], edited: [], added: [], removed: [],
  };
  for (const task of next.tasks.values()) {
    const before = previous.tasks.get(task.key);
    if (!before) {
      lists.added.push(task.key);
      continue;
    }
    if (task.completed !== before.completed) (task.completed ? lists.completed : lists.reopened).push(task.key);
    for (const [subKey, completed] of task.subItems) {
      const was = before.subItems.get(subKey);
      if (was !== undefined && was !== completed) (completed ? lists.completed : lists.reopened).push(`${task.key}/${subKey}`);
    }
    if ((task.notes ?? '') !== (before.notes ?? '')) lists.notesChanged.push(task.key);
    if (task.answers !== before.answers) lists.answersChanged.push(task.key);
    if (task.shapeWithoutRunState !== before.shapeWithoutRunState) lists.edited.push(task.key);
  }
  for (const key of previous.tasks.keys()) {
    if (!next.tasks.has(key)) lists.removed.push(key);
  }

  let omitted = 0;
  for (const name of TASK_CHANGE_KINDS) {
    const ids = lists[name];
    if (ids.length === 0) continue;
    summary[name] = ids.slice(0, MAX_LISTED_IDS);
    omitted += Math.max(0, ids.length - MAX_LISTED_IDS);
  }
  if (omitted > 0) summary.omittedIds = omitted;
  return summary;
}

const isAuditedRow: (value: unknown) => value is AuditedRowFields = isRecord;

export function compactAuditDiff<T>(diff: T, before: unknown): T | JsonRecord {
  if (!isRecord(diff)) return diff;
  const next: AuditedRowFields = { ...diff };
  if ('items' in next) {
    next.items = summarizeTaskChanges(isAuditedRow(before) ? before.items : undefined, next.items);
  }
  if ('retired_items' in next) {
    const retired = parseJsonArray(next.retired_items);
    next.retired_items = retired ? { count: retired.length } : { omitted: true };
  }
  if (typeof next.share_token === 'string') next.share_token = REDACTED;
  return next;
}

export async function capAuditColumn(json: string | null): Promise<string | null> {
  if (json === null) return null;
  const size = utf8Bytes(json);
  if (size <= MAX_AUDIT_COLUMN_BYTES) return json;
  return JSON.stringify({ truncated: true, bytes: size, sha256: await sha256Hex(json) });
}
