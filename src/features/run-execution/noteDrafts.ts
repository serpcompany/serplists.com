import { useEffect } from 'react';

import type { ChecklistRun } from '@/types/checklist';

// Unsaved task notes, by item id. A draft exists only while it differs from the saved
// notes, so it survives moving between tasks and a save that returns while the user is
// still typing. Mark Complete and completing the run carry drafts in their own save.
export type NoteDrafts = Readonly<Record<string, string>>;

const savedNotesById = (run: ChecklistRun): Map<string, string> =>
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
  const { [itemId]: _previous, ...rest } = drafts;
  return value === (savedNotes ?? '') ? rest : { ...rest, [itemId]: value };
};

// After a save, keep only drafts that still differ from what the run now holds.
export const pruneNoteDrafts = (drafts: NoteDrafts, run: ChecklistRun): NoteDrafts => {
  const saved = savedNotesById(run);
  const kept = Object.entries(drafts).filter(
    ([itemId, value]) => saved.has(itemId) && saved.get(itemId) !== value,
  );
  return kept.length === Object.keys(drafts).length ? drafts : Object.fromEntries(kept);
};

// True when someone else changed the saved notes of a drafted task between two versions
// of the run, so saving the draft would overwrite their text.
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

export const confirmLeaveWithUnsavedNotes = (
  hasUnsavedNotes: boolean,
  confirmDialog: (message: string) => boolean = (message) => window.confirm(message),
): boolean => !hasUnsavedNotes || confirmDialog(RUN_NOTES_UNSAVED_MESSAGE);

export const applyUnsavedNotesWarning = (
  event: Pick<BeforeUnloadEvent, 'preventDefault' | 'returnValue'>,
  hasUnsavedNotes: boolean,
): void => {
  if (!hasUnsavedNotes) {
    return;
  }
  event.preventDefault();
  event.returnValue = '';
};

// Asks the browser to confirm closing or reloading the tab while notes are unsaved.
export const useUnsavedNotesWarning = (hasUnsavedNotes: boolean): void => {
  useEffect(() => {
    if (!hasUnsavedNotes) {
      return undefined;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) =>
      applyUnsavedNotesWarning(event, hasUnsavedNotes);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedNotes]);
};
