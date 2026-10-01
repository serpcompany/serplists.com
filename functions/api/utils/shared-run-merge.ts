import { z } from 'zod';
import { normalizeSectionsPayload, parseJsonArray } from './payloads';

export const MAX_SHARED_RUN_NOTES_LENGTH = 5000;

const sharedRunItemSchema = z.object({
  id: z.string(),
  isCompleted: z.boolean().optional(),
  completed: z.boolean().optional(),
  notes: z.unknown().optional(),
  subItems: z.unknown().optional(),
  contents: z.unknown().optional(),
});

export const sharedRunUpdateSchema = z.object({
  sections: z.array(z.object({
    id: z.string(),
    items: z.array(sharedRunItemSchema).max(10_000),
  })).max(1_000).optional(),
  status: z.enum(['in_progress', 'completed']).optional(),
  expected_revision: z.number().int().positive(),
});

type SharedRunSection = NonNullable<z.infer<typeof sharedRunUpdateSchema>['sections']>[number];
type SharedRunItem = SharedRunSection['items'][number];
type JsonRecord = Record<string, unknown>;

const sharedSubItemSchema = z.object({
  id: z.unknown().optional(),
  isCompleted: z.boolean().optional(),
  completed: z.boolean().optional(),
});
type SharedSubItem = z.infer<typeof sharedSubItemSchema>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stringId = (value: unknown): string | null =>
  isRecord(value) && typeof value.id === 'string' && value.id !== '' ? value.id : null;

function readCompletion(state: { isCompleted?: boolean | undefined; completed?: boolean | undefined }): boolean | undefined {
  return state.isCompleted ?? state.completed;
}

function applyCompletion(target: JsonRecord, completed: boolean | undefined): void {
  if (completed === undefined) return;
  target.isCompleted = completed;
  delete target.completed;
}

function parseSubItem(value: unknown): SharedSubItem | undefined {
  const parsed = sharedSubItemSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function mergeItemSubItems(stored: JsonRecord, guest: SharedRunItem): { subItems?: unknown[]; contents?: unknown[] } {
  const guestContents = asArray(guest.contents);
  const guestSubItems = [
    ...asArray(guest.subItems),
    ...guestContents.flatMap((content) => (isRecord(content) ? asArray(content.subItems) : [])),
  ];
  const guestById = new Map<string, unknown[]>();
  for (const subItem of guestSubItems) {
    const id = stringId(subItem);
    if (id) guestById.set(id, [...(guestById.get(id) ?? []), subItem]);
  }
  const storedIdCounts = new Map<string, number>();
  const storedSubItems = [
    ...asArray(stored.subItems),
    ...asArray(stored.contents).flatMap((content) => (isRecord(content) ? asArray(content.subItems) : [])),
  ];
  for (const subItem of storedSubItems) {
    const id = stringId(subItem);
    if (id) storedIdCounts.set(id, (storedIdCounts.get(id) ?? 0) + 1);
  }

  const mergeList = (storedList: unknown[], guestList: unknown[]) => storedList.map((subItem, index) => {
    if (!isRecord(subItem)) return subItem;
    const id = stringId(subItem);
    const byId = id && storedIdCounts.get(id) === 1 ? guestById.get(id) : undefined;
    const positional = stringId(guestList[index]) === id ? guestList[index] : undefined;
    const match = parseSubItem(byId?.length === 1 ? byId[0] : positional);
    if (!match) return subItem;
    const next = { ...subItem };
    applyCompletion(next, readCompletion(match));
    return next;
  });

  const merged: { subItems?: unknown[]; contents?: unknown[] } = {};
  if (Array.isArray(stored.subItems)) {
    merged.subItems = mergeList(stored.subItems, asArray(guest.subItems));
  }
  if (Array.isArray(stored.contents)) {
    merged.contents = stored.contents.map((content, index) => {
      if (!isRecord(content) || !Array.isArray(content.subItems)) return content;
      const guestContent = guestContents[index];
      return {
        ...content,
        subItems: mergeList(content.subItems, isRecord(guestContent) ? asArray(guestContent.subItems) : []),
      };
    });
  }
  return merged;
}

function mergeItem(stored: JsonRecord, guest: SharedRunItem): { item: JsonRecord } | { error: string } {
  const next: JsonRecord = { ...stored, ...mergeItemSubItems(stored, guest) };
  applyCompletion(next, readCompletion(guest));
  if (typeof guest.notes === 'string' && guest.notes !== stored.notes) {
    if (guest.notes.length > MAX_SHARED_RUN_NOTES_LENGTH) {
      return { error: `Task notes must be ${MAX_SHARED_RUN_NOTES_LENGTH} characters or fewer.` };
    }
    next.notes = guest.notes;
  }
  return { item: next };
}

export function readStoredRunSections(items: unknown): unknown[] | null {
  const parsed = parseJsonArray(items ?? '[]');
  return parsed ? normalizeSectionsPayload(parsed).sections : null;
}

export function mergeSharedRunState(
  storedSections: unknown[],
  payloadSections: SharedRunSection[],
): { sections: unknown[] } | { error: string } {
  const guestItems = new Map<string, SharedRunItem[]>();
  for (const section of payloadSections) {
    for (const item of section.items) {
      const key = `${section.id}\u0000${item.id}`;
      guestItems.set(key, [...(guestItems.get(key) ?? []), item]);
    }
  }

  let error: string | null = null;
  const sections = normalizeSectionsPayload(storedSections).sections.map((section, sectionIndex) => {
    if (!isRecord(section) || !Array.isArray(section.items)) return section;
    const sectionId = typeof section.id === 'string' ? section.id : String(sectionIndex + 1);
    return {
      ...section,
      items: section.items.map((item, itemIndex) => {
        if (!isRecord(item)) return item;
        const itemId = typeof item.id === 'string' ? item.id : `${sectionIndex + 1}-${itemIndex + 1}`;
        const guestItem = guestItems.get(`${sectionId}\u0000${itemId}`)?.shift();
        if (!guestItem) return item;
        const merged = mergeItem(item, guestItem);
        if ('error' in merged) {
          error ??= merged.error;
          return item;
        }
        return merged.item;
      }),
    };
  });

  return error ? { error } : { sections };
}
