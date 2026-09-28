import { sha256Hex } from './crypto';
import { normalizeSectionsPayload, parseJsonArray } from './payloads';

// Keeps audit rows small. D1 rejects rows over 2,000,000 bytes and the audit insert shares a
// batch with the write it records, so an oversized audit row would roll back that write.
//   - Snapshots (before/after) never carry run or template content (`items`,
//     `retired_items`) or share tokens: the rows themselves and template_versions hold them.
//   - A diff's `items` becomes a summary of task ids that changed; notes text is never kept.
//   - Every JSON column is capped, measured in UTF-8 bytes; anything larger becomes a marker.

type JsonRecord = Record<string, unknown>;

const MAX_AUDIT_COLUMN_BYTES = 64 * 1024;
export const MAX_AUDIT_USER_AGENT_LENGTH = 512;
const MAX_LISTED_IDS = 50;
const REDACTED = '[redacted]';

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** A before/after snapshot without content blobs or share tokens. */
export function compactAuditSnapshot<T>(value: T): T | JsonRecord {
  if (!isRecord(value)) return value;
  const { items: _items, retired_items: _retired, share_token: _shareToken, ...rest } = value;
  return rest;
}

type TaskState = { key: string; completed: boolean; notes: unknown; subItems: Map<string, boolean>; shape: string };

function readTasks(raw: unknown): { sections: number; tasks: Map<string, TaskState> } | null {
  const parsed = parseJsonArray(raw);
  if (!parsed) return null;
  const sections = normalizeSectionsPayload(parsed).sections;
  const tasks = new Map<string, TaskState>();
  sections.forEach((section, sectionIndex) => {
    asArray(isRecord(section) ? section.items : undefined).forEach((item, itemIndex) => {
      if (!isRecord(item)) return;
      const baseKey = typeof item.id === 'string' && item.id ? item.id : `${sectionIndex + 1}-${itemIndex + 1}`;
      let key = baseKey;
      for (let copy = 2; tasks.has(key); copy += 1) key = `${baseKey}#${copy}`;

      const subItems = new Map<string, boolean>();
      const subItemLists = [asArray(item.subItems), ...asArray(item.contents).map((content) => asArray(isRecord(content) ? content.subItems : undefined))];
      subItemLists.flat().forEach((subItem, subIndex) => {
        if (!isRecord(subItem)) return;
        const subKey = typeof subItem.id === 'string' && subItem.id ? subItem.id : String(subIndex + 1);
        subItems.set(subKey, subItem.isCompleted === true || subItem.completed === true);
      });
      // Everything a guest or runner cannot change, to tell template edits from progress.
      const shape = JSON.stringify(item, (name, entry) =>
        name === 'isCompleted' || name === 'completed' || name === 'notes' ? undefined : entry);
      tasks.set(key, {
        key,
        completed: item.isCompleted === true || item.completed === true,
        notes: item.notes,
        subItems,
        shape,
      });
    });
  });
  return { sections: sections.length, tasks };
}

function summarizeTaskChanges(previousRaw: unknown, nextRaw: unknown): JsonRecord {
  const next = readTasks(nextRaw);
  if (!next) return { omitted: true };
  const summary: JsonRecord = { sections: next.sections, items: next.tasks.size };
  const previous = previousRaw === undefined ? null : readTasks(previousRaw);
  if (!previous) return summary;

  const lists: Record<string, string[]> = {
    completed: [], reopened: [], notesChanged: [], edited: [], added: [], removed: [],
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
    if (task.shape !== before.shape) lists.edited.push(task.key);
  }
  for (const key of previous.tasks.keys()) {
    if (!next.tasks.has(key)) lists.removed.push(key);
  }

  let omitted = 0;
  for (const [name, ids] of Object.entries(lists)) {
    if (ids.length === 0) continue;
    summary[name] = ids.slice(0, MAX_LISTED_IDS);
    omitted += Math.max(0, ids.length - MAX_LISTED_IDS);
  }
  if (omitted > 0) summary.omittedIds = omitted;
  return summary;
}

/** A diff with task content replaced by the ids that changed, compared with `before.items`. */
export function compactAuditDiff<T>(diff: T, before: unknown): T | JsonRecord {
  if (!isRecord(diff)) return diff;
  const next: JsonRecord = { ...diff };
  if ('items' in next) {
    next.items = summarizeTaskChanges(isRecord(before) ? before.items : undefined, next.items);
  }
  if ('retired_items' in next) {
    const retired = parseJsonArray(next.retired_items);
    next.retired_items = retired ? { count: retired.length } : { omitted: true };
  }
  if (typeof next.share_token === 'string') next.share_token = REDACTED;
  return next;
}

/** Replaces a serialized column over the byte cap with a small, valid JSON marker. */
export async function capAuditColumn(json: string | null): Promise<string | null> {
  if (json === null) return null;
  const size = utf8Bytes(json);
  if (size <= MAX_AUDIT_COLUMN_BYTES) return json;
  return JSON.stringify({ truncated: true, bytes: size, sha256: await sha256Hex(json) });
}
