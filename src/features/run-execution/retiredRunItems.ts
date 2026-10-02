import { z } from 'zod';

import { taskRecordsIn, type SubTaskRecord, type TaskRecord } from '@/lib/schemas/jsonRecords';
import { getTaskSubTasks } from '@/lib/schemas/storedSections';
import type { RetiredRunItem, RetiredRunSubTask, RetiredRunTask } from '@/types/checklist';

const recordWithId = z.object({ id: z.string().min(1) }).passthrough();
const retiredEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), section: recordWithId.extend({ title: z.unknown(), items: z.unknown() }) }),
  z.object({ kind: z.literal('item'), sectionTitle: z.string().optional(), item: recordWithId }),
  z.object({ kind: z.literal('subItem'), itemTitle: z.string().optional(), subItem: recordWithId }),
]);

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const wasCompleted = (value: TaskRecord | SubTaskRecord): boolean =>
  typeof value.isCompleted === 'boolean' ? value.isCompleted : value.completed === true;

const toSubTask = (subItem: SubTaskRecord, index: number): RetiredRunSubTask => ({
  id: typeof subItem.id === 'string' ? subItem.id : String(index + 1),
  title: text(subItem.title),
  isCompleted: wasCompleted(subItem),
});

const toTask = (item: TaskRecord, index: number): RetiredRunTask => {
  const subItems = getTaskSubTasks(item);
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
          tasks: taskRecordsIn(entry.section.items).map(toTask),
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
