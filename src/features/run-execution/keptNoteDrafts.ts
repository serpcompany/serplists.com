import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { getSessionStorage } from '@/lib/browserStorage';
import { registerLeaveGuard } from '@/lib/navigation/leaveGuard';
import type { ChecklistRun } from '@/types/checklist';

import { RUN_NOTES_UNSAVED_MESSAGE, type NoteDrafts } from './noteDrafts';

// Unsaved task notes, kept when the session ends in the background (a sign-out in another
// tab, an expired or revoked session), which unmounts the run page without asking. The run
// page gives them back as unsaved drafts once the same user opens the run again.
// - sessionStorage: it survives the /login redirect and ends with the tab.
// - The key names the user and the run, so notes never open for another account.
// - Each draft keeps the saved notes it was typed over. A task whose notes changed on the
//   server since then gets nothing back: saving the draft would overwrite that text.
const KEY_PREFIX = 'serplists:run-note-drafts';
const FORMAT = 1;

export type KeptNoteDraftOwner = { userId: string; runId: string };
export type KeptNoteDraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const keptNotesSchema = z.object({
  format: z.literal(FORMAT),
  notes: z.record(z.object({ draft: z.string(), saved: z.string() })),
});

const getKey = ({ userId, runId }: KeptNoteDraftOwner): string => `${KEY_PREFIX}:${userId}:${runId}`;

const defaultStorage = (): KeptNoteDraftStorage | null => getSessionStorage() ?? null;

const savedNotesById = (run: ChecklistRun): Map<string, string> =>
  new Map(run.sections.flatMap((section) => section.items.map((item) => [item.id, item.notes ?? ''] as const)));

// True when the drafts are stored (or there are none).
export const keepRunNoteDrafts = (
  owner: KeptNoteDraftOwner,
  drafts: NoteDrafts,
  run: ChecklistRun,
  storage: KeptNoteDraftStorage | null = defaultStorage(),
): boolean => {
  const saved = savedNotesById(run);
  const entries = Object.entries(drafts).map(([itemId, draft]) => [itemId, { draft, saved: saved.get(itemId) ?? '' }]);
  if (entries.length === 0) return true;
  if (!storage) return false;
  try {
    storage.setItem(getKey(owner), JSON.stringify({ format: FORMAT, notes: Object.fromEntries(entries) }));
    return true;
  } catch {
    return false;
  }
};

// The kept drafts that still apply to the run as loaded now, removed from storage.
export const takeKeptRunNoteDrafts = (
  owner: KeptNoteDraftOwner,
  run: ChecklistRun,
  storage: KeptNoteDraftStorage | null = defaultStorage(),
): NoteDrafts => {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(getKey(owner)) ?? null;
    if (raw) storage?.removeItem(getKey(owner));
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: z.infer<typeof keptNotesSchema>;
  try {
    const result = keptNotesSchema.safeParse(JSON.parse(raw));
    if (!result.success) return {};
    parsed = result.data;
  } catch {
    return {};
  }
  const saved = savedNotesById(run);
  return Object.fromEntries(
    Object.entries(parsed.notes)
      .filter(([itemId, kept]) => saved.get(itemId) === kept.saved && kept.draft !== kept.saved)
      .map(([itemId, kept]) => [itemId, kept.draft]),
  );
};

// Signing out asks before unsaved notes are lost, and a session that ends in the background
// keeps them (leaveGuard.ts). The kept notes come back once this user opens the run again.
// `run` is the private run on the page (null for a shared run, which is not the user's).
export const useKeptRunNoteDrafts = ({
  run,
  noteDrafts,
  restoreNoteDrafts,
}: {
  run: ChecklistRun | null;
  noteDrafts: NoteDrafts;
  restoreNoteDrafts: (drafts: NoteDrafts) => void;
}): void => {
  const { user } = useAuth();
  const userId = user?.id;
  const latest = useRef({ userId, run, noteDrafts, restoreNoteDrafts });
  latest.current = { userId, run, noteDrafts, restoreNoteDrafts };

  useEffect(() => {
    let leaveAllowed = false;
    return registerLeaveGuard({
      message: RUN_NOTES_UNSAVED_MESSAGE,
      shouldConfirm: () => !leaveAllowed && Object.keys(latest.current.noteDrafts).length > 0,
      onLeaveConfirmed: () => {
        leaveAllowed = true;
      },
      onLeaveCancelled: () => {
        leaveAllowed = false;
      },
      onSessionEnding: () => {
        const { userId: owner, run: shown, noteDrafts: drafts } = latest.current;
        // A shared run's page is public: it stays open, with its notes, after a sign-out.
        if (!shown) return true;
        return Boolean(owner) && keepRunNoteDrafts({ userId: owner ?? '', runId: shown.id }, drafts, shown);
      },
    });
  }, []);

  const runId = run?.id;
  useEffect(() => {
    const shown = latest.current.run;
    if (!userId || !runId || !shown) return;
    const kept = takeKeptRunNoteDrafts({ userId, runId }, shown);
    if (Object.keys(kept).length === 0) return;
    latest.current.restoreNoteDrafts(kept);
    toast('Your unsaved task notes were restored.');
  }, [runId, userId]);
};
