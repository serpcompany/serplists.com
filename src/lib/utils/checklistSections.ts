import type { ChecklistSection } from "@/types/checklist";
import { legacySectionsSchema, parseLegacySections } from '../schemas/legacyChecklistSchema';

export class InvalidChecklistContentError extends Error {
  constructor() {
    super('This checklist contains invalid content. Its stored data has not been changed.');
    this.name = 'InvalidChecklistContentError';
  }
}

export function mapReadableChecklists<T, U>(records: T[], map: (record: T) => U) {
  const readable: U[] = [];
  let invalidCount = 0;
  for (const record of records) {
    try { readable.push(map(record)); }
    catch (error) {
      if (!(error instanceof InvalidChecklistContentError)) throw error;
      invalidCount += 1;
    }
  }
  return { readable, invalidCount };
}

export function isSectionsShape(value: unknown): boolean {
  return legacySectionsSchema.safeParse(value).success;
}

export function normalizeRecordSections(record: Record<string, unknown>): ChecklistSection[] {
  if (record.content_error !== undefined) throw new InvalidChecklistContentError();
  if (record.sections !== undefined) return normalizeSections(record.sections);
  if (record.items !== undefined) return normalizeSections(record.items);
  return [];
}

export function normalizeSections(raw: unknown): ChecklistSection[] {
  const parsed = parseLegacySections(raw);
  if (!parsed.success) throw new InvalidChecklistContentError();
  // Reserve every supplied identity before creating a read-only identity for a
  // missing legacy field. Never collide with a later supplied or generated ID.
  const usedIds = new Set<string>();
  for (const section of parsed.data) {
    if (section.id !== undefined) usedIds.add(section.id);
    for (const item of section.items) {
      if (item.id !== undefined) usedIds.add(item.id);
      for (const child of item.subItems ?? []) if (child.id !== undefined) usedIds.add(child.id);
      for (const content of item.contents ?? []) {
        if (content.id !== undefined) usedIds.add(content.id);
        for (const child of content.subItems ?? []) if (child.id !== undefined) usedIds.add(child.id);
      }
    }
  }
  function identity(supplied: string | undefined, base: string): string {
    if (supplied !== undefined) return supplied;
    let candidate = base;
    for (let suffix = 1; usedIds.has(candidate); suffix++) candidate = `${base}-legacy-${suffix}`;
    usedIds.add(candidate);
    return candidate;
  }
  return parsed.data.map((s, sectionIndex) => {

    return {
      ...s,
      id: identity(s.id, String(sectionIndex + 1)),
      title: typeof s.title === "string" ? s.title : "Checklist",
      items: s.items.map((it, itemIndex) => {
        const isCompleted =
          typeof it.isCompleted === "boolean"
            ? it.isCompleted
            : typeof it.completed === "boolean"
              ? it.completed
              : false;

        const contents = it.contents?.map((content, contentIndex) => ({
          ...content,
          id: identity(content.id, `${sectionIndex + 1}-${itemIndex + 1}-content-${contentIndex + 1}`),
          value: content.value ?? '',
          subItems: content.subItems?.map((subItem, subIndex) => ({
            ...subItem,
            id: identity(subItem.id, `${sectionIndex + 1}-${itemIndex + 1}-content-${contentIndex + 1}-sub-${subIndex + 1}`),
            title: subItem.title ?? '',
            isCompleted: subItem.isCompleted ?? subItem.completed ?? false,
          })),
        }));
        const { completed: _legacyCompletion, ...canonicalItem } = it;
        return {
          ...canonicalItem,
          id: identity(it.id, `${sectionIndex + 1}-${itemIndex + 1}`),
          title: typeof it.title === "string" ? it.title : "",
          isCompleted,
          contents,
        };
      }),
    } satisfies ChecklistSection;
  });
}

export function calculateSectionsProgress(sections: ChecklistSection[]): number {
  let completed = 0;
  let total = 0;

  sections.forEach((section) => {
    section.items.forEach((item) => {
      total++;
      if (item.isCompleted) completed++;

      item.contents?.forEach((content) => {
        if (content.type === "subItems" && content.subItems) {
          content.subItems.forEach((subItem) => {
            total++;
            if (subItem.isCompleted) completed++;
          });
        }
      });
    });
  });

  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function resetSectionsCompletion(sections: ChecklistSection[]): ChecklistSection[] {
  return normalizeSections(sections).map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      isCompleted: false,
      contents: item.contents?.map((content) => {
        if (content.type !== "subItems") return content;
        if (!content.subItems) return { ...content, subItems: [] };
        return {
          ...content,
          subItems: content.subItems.map((subItem) => ({
            ...subItem,
            isCompleted: false,
          })),
        };
      }),
    })),
  }));
}
