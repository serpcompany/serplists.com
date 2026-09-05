import type { ChecklistSection } from '@/types/checklist';
import { parseLegacySections } from '@/lib/schemas/legacyChecklistSchema';
import { InvalidChecklistContentError } from '@/lib/utils/checklistSections';

// The strict editor owns these fields. Everything else remains opaque stored
// data and must survive a save of the same identity, not a positional neighbor.
const sectionFields = new Set(['id', 'title', 'items']);
const itemFields = new Set(['id', 'title', 'description', 'contents', 'isCompleted']);
const contentFields = new Set(['id', 'type', 'value', 'uploadType', 'fileName', 'fileSize', 'subItems']);
const subItemFields = new Set(['id', 'title', 'isCompleted']);
function extensions(record: object | undefined, known: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record ?? {}).filter(([key]) => !known.has(key)));
}

export function preserveTemplateEditorExtensions(
  source: ChecklistSection[],
  edited: ChecklistSection[],
): ChecklistSection[] {
  if (!parseLegacySections(source).success || !parseLegacySections(edited).success) {
    throw new InvalidChecklistContentError();
  }
  const sections = new Map(source.map(section => [section.id, section]));
  const items = new Map(source.flatMap(section => section.items.map(item => [item.id, item] as const)));
  const contents = new Map(source.flatMap(section => section.items.flatMap(item => (item.contents ?? []).map(content => [JSON.stringify([item.id, content.id]), content] as const))));
  const subItems = new Map(source.flatMap(section => section.items.flatMap(item => (item.contents ?? []).flatMap(content => (content.subItems ?? []).map(subItem => [JSON.stringify([item.id, content.id, subItem.id]), subItem] as const)))));
  return edited.map(section => ({
    ...extensions(sections.get(section.id), sectionFields),
    ...section,
    items: section.items.map(item => ({
      ...extensions(items.get(item.id), itemFields),
      ...item,
      ...(item.contents === undefined ? {} : { contents: item.contents.map(content => ({
        ...extensions(contents.get(JSON.stringify([item.id, content.id])), contentFields),
        ...content,
        ...(content.subItems === undefined ? {} : { subItems: content.subItems.map(subItem => ({
          ...extensions(subItems.get(JSON.stringify([item.id, content.id, subItem.id])), subItemFields),
          ...subItem,
        })) }),
      })) }),
    })),
  }));
}
