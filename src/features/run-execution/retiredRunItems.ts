import { z } from 'zod';

import type { RetiredRunItem, RetiredRunSubTask, RetiredRunTask } from '@/types/checklist';

// checklist_runs.retired_items, written by Template reconciliation and Revalidate: a JSON
// array of { kind, section | item | subItem } holding the Run's copy of the removed work.
const recordWithId = z.object({ id: z.string().min(1) }).passthrough();
const retiredEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), section: recordWithId }),
  z.object({ kind: z.literal('item'), sectionTitle: z.string().optional(), item: recordWithId }),
  z.object({ kind: z.literal('subItem'), itemTitle: z.string().optional(), subItem: recordWithId }),
]);

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const records = (value: unknown): JsonRecord[] => (Array.isArray(value) ? value.filter(isRecord) : []);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

// Older runs store `completed` instead of `isCompleted`.
const wasCompleted = (value: JsonRecord): boolean =>
  typeof value.isCompleted === 'boolean' ? value.isCompleted : value.completed === true;

const toSubTask = (subItem: JsonRecord, index: number): RetiredRunSubTask => ({
  id: typeof subItem.id === 'string' ? subItem.id : String(index + 1),
  title: text(subItem.title),
  isCompleted: wasCompleted(subItem),
});

// Sub-tasks live on the task or in its subItems content blocks.
const toTask = (item: JsonRecord, index: number): RetiredRunTask => {
  const subItems = [
    ...records(item.subItems),
    ...records(item.contents).flatMap((content) => records(content.subItems)),
  ];
  const notes = text(item.notes);
  return {
    id: typeof item.id === 'string' ? item.id : String(index + 1),
    title: text(item.title),
    isCompleted: wasCompleted(item),
    ...(notes.trim() ? { notes } : {}),
    subTasks: subItems.map(toSubTask),
  };
};

const parseArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Parses a Run's retired_items (a JSON string or an array). Malformed entries are dropped.
 * An id retired more than once keeps only its latest entry.
 */
export function parseRetiredRunItems(value: unknown): RetiredRunItem[] {
  const byKey = new Map<string, RetiredRunItem>();

  for (const raw of parseArray(value)) {
    const parsed = retiredEntrySchema.safeParse(raw);
    if (!parsed.success) continue;
    const entry = parsed.data;
    let item: RetiredRunItem;
    switch (entry.kind) {
      case 'section':
        item = {
          kind: 'section',
          id: entry.section.id,
          title: text(entry.section.title),
          tasks: records(entry.section.items).map(toTask),
        };
        break;
      case 'item':
        item = { kind: 'item', id: entry.item.id, sectionTitle: entry.sectionTitle, task: toTask(entry.item, 0) };
        break;
      case 'subItem':
        item = { kind: 'subItem', id: entry.subItem.id, itemTitle: entry.itemTitle, subTask: toSubTask(entry.subItem, 0) };
        break;
    }
    const key = `${item.kind}:${item.id}`;
    byKey.delete(key);
    byKey.set(key, item);
  }

  return [...byKey.values()];
}
