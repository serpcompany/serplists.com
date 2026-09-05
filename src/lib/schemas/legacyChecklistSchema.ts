import { z } from 'zod';

// Stored/portable content predates mandatory editor identities. Validate its
// structure without stripping extension fields or changing the persisted data.
const completion = {
  isCompleted: z.boolean().optional(),
  completed: z.boolean().optional(),
};
const subItem = z.object({
  id: z.string().optional(), title: z.string().optional(), ...completion,
}).passthrough();
const content = z.object({
  id: z.string().optional(),
  type: z.enum(['text', 'image', 'video', 'file', 'embed', 'subItems']),
  value: z.string().optional(),
  uploadType: z.enum(['url', 'upload']).optional(),
  fileName: z.string().optional(), fileSize: z.number().finite().nonnegative().optional(),
  subItems: z.array(subItem).optional(),
}).passthrough();
const item = z.object({
  id: z.string().optional(), title: z.string().optional(),
  description: z.string().optional(), notes: z.string().optional(),
  contents: z.array(content).optional(), ...completion,
  subItems: z.array(subItem).optional(),
}).passthrough();
const section = z.object({
  id: z.string().optional(), title: z.string().optional(), items: z.array(item),
}).passthrough();

export const legacySectionsSchema = z.array(section).superRefine((sections, context) => {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const subItemIds = new Set<string>();
  function check(id: string | undefined, seen: Set<string>) {
    if (id === undefined) return;
    if (!id.trim() || seen.has(id)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Checklist identities must be unambiguous' });
    seen.add(id);
  }
  for (const section of sections) {
    check(section.id, sectionIds);
    for (const item of section.items) {
      check(item.id, itemIds);
      const contentIds = new Set<string>();
      for (const child of item.subItems ?? []) check(child.id, subItemIds);
      for (const content of item.contents ?? []) {
        check(content.id, contentIds);
        for (const child of content.subItems ?? []) check(child.id, subItemIds);
      }
    }
  }
});
export const legacyItemsSchema = z.array(item);
const retiredEntriesSchema = z.array(z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), section }).passthrough(),
  z.object({ kind: z.literal('item'), sectionId: z.string(), sectionTitle: z.string().optional(), item }).passthrough(),
  z.object({ kind: z.literal('subItem'), sectionId: z.string(), itemId: z.string(), itemTitle: z.string().optional(), subItem }).passthrough(),
]));
export function validRetiredChecklistContent(input: unknown): boolean {
  try { return retiredEntriesSchema.safeParse(typeof input === 'string' ? JSON.parse(input) : input).success; }
  catch { return false; }
}

export function parseLegacySections(input: unknown) {
  let value: unknown = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); }
    catch { return { success: false as const }; }
  }
  if (!Array.isArray(value)) return { success: false as const };
  const hasSections = value.some((entry: unknown) =>
    typeof entry === 'object' && entry !== null && 'items' in entry);
  if (hasSections) return legacySectionsSchema.safeParse(value);
  const flat = legacyItemsSchema.safeParse(value);
  if (!flat.success) return flat;
  return legacySectionsSchema.safeParse(value.length === 0 ? [] : [{
    id: '1', title: 'Checklist', items: flat.data,
  }]);
}
