import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { getSessionStorage } from '@/lib/browserStorage';
import type { ChecklistRun } from '@/types/checklist';

import { savedNotesById, type NoteDrafts } from './noteDrafts';

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

export const keepRunNoteDrafts = (
  owner: KeptNoteDraftOwner,
  drafts: NoteDrafts,
  run: ChecklistRun,
  storage: KeptNoteDraftStorage | null = defaultStorage(),
): boolean => {
  const saved = savedNotesById(run);
  const entries = Object.entries(drafts).map(
    ([itemId, draft]): [string, { draft: string; saved: string }] => [itemId, { draft, saved: saved.get(itemId) ?? '' }],
  );
  if (entries.length === 0) return true;
  if (!storage) return false;
  try {
    storage.setItem(getKey(owner), JSON.stringify({ format: FORMAT, notes: Object.fromEntries(entries) }));
    return true;
  } catch {
    return false;
  }
};

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

export const useKeptRunNoteDrafts = ({
  privateRun,
  noteDrafts,
  restoreNoteDrafts,
}: {
  privateRun: ChecklistRun | null;
  noteDrafts: NoteDrafts;
  restoreNoteDrafts: (drafts: NoteDrafts) => void;
}): (() => boolean) => {
  const { user } = useAuth();
  const userId = user?.id;
  const latest = useRef({ userId, privateRun, noteDrafts, restoreNoteDrafts });
  useEffect(() => {
    latest.current = { userId, privateRun, noteDrafts, restoreNoteDrafts };
  });

  const keepNoteDrafts = useCallback(() => {
    const { userId: owner, privateRun: run, noteDrafts: drafts } = latest.current;
    if (!run) return true;
    return Boolean(owner) && keepRunNoteDrafts({ userId: owner ?? '', runId: run.id }, drafts, run);
  }, []);

  const runId = privateRun?.id;
  useEffect(() => {
    const run = latest.current.privateRun;
    if (!userId || !runId || !run) return;
    const kept = takeKeptRunNoteDrafts({ userId, runId }, run);
    if (Object.keys(kept).length === 0) return;
    latest.current.restoreNoteDrafts(kept);
    toast('Your unsaved task notes were restored.');
  }, [runId, userId]);

  return keepNoteDrafts;
};
