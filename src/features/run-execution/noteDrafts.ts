import type { ChecklistRun } from '@/types/checklist';

export type NoteDrafts = Readonly<Record<string, string>>;

export const savedNotesById = (run: ChecklistRun): Map<string, string> =>
  new Map(
    run.sections.flatMap((section) =>
      section.items.map((item) => [item.id, item.notes ?? ''] as const),
    ),
  );

export const updateNoteDraft = (
  drafts: NoteDrafts,
  itemId: string,
  value: string,
  savedNotes: string | undefined,
): NoteDrafts => {
  const { [itemId]: previousDraft, ...rest } = drafts;
  return value === (savedNotes ?? '') ? rest : { ...rest, [itemId]: value };
};

export const pruneNoteDrafts = (drafts: NoteDrafts, run: ChecklistRun): NoteDrafts => {
  const saved = savedNotesById(run);
  const kept = Object.entries(drafts).filter(
    ([itemId, value]) => saved.has(itemId) && saved.get(itemId) !== value,
  );
  return kept.length === Object.keys(drafts).length ? drafts : Object.fromEntries(kept);
};

export const hasNoteDraftFor = (drafts: NoteDrafts, run: ChecklistRun, itemId: string): boolean => {
  const draft = drafts[itemId];
  return draft !== undefined && draft !== savedNotesById(run).get(itemId);
};

export const draftedNotesChanged = (
  drafts: NoteDrafts,
  before: ChecklistRun,
  after: ChecklistRun,
  itemIds: readonly string[] = Object.keys(drafts),
): boolean => {
  const was = savedNotesById(before);
  const now = savedNotesById(after);
  return itemIds.some((itemId) => drafts[itemId] !== undefined && was.get(itemId) !== now.get(itemId));
};

export const applyNoteDrafts = (
  run: ChecklistRun,
  drafts: NoteDrafts,
  itemIds?: readonly string[],
): ChecklistRun => ({
  ...run,
  sections: run.sections.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const draft = drafts[item.id];
      return draft !== undefined && (!itemIds || itemIds.includes(item.id))
        ? { ...item, notes: draft }
        : item;
    }),
  })),
});

export const RUN_NOTES_UNSAVED_MESSAGE = 'You have unsaved task notes. Leave without saving?';
