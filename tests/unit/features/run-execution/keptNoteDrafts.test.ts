import { describe, expect, it } from 'vitest';

import {
  keepRunNoteDrafts,
  takeKeptRunNoteDrafts,
  type KeptNoteDraftStorage,
} from '@/features/run-execution/keptNoteDrafts';
import type { ChecklistRun } from '@/types/checklist';

// Unsaved task notes, kept when the session ends in the background so the run page can
// offer them back after sign-in.

const buildRun = (notes: Record<string, string | undefined>): ChecklistRun => ({
  id: 'run-1',
  templateId: 'template-1',
  title: 'Launch',
  status: 'in_progress',
  progress: 0,
  sections: [
    {
      id: 'section-1',
      title: 'Checklist',
      items: Object.entries(notes).map(([id, value]) => ({ id, title: id, notes: value })),
    },
  ],
  startedAt: '2026-01-01T00:00:00.000Z',
  userId: 'user-1',
});

const createStorage = (): KeptNoteDraftStorage & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };
};

const blockedStorage: KeptNoteDraftStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

const owner = { userId: 'user-1', runId: 'run-1' };

describe('kept run note drafts', () => {
  it('gives the drafts back once, for the same user and run', () => {
    const storage = createStorage();
    const run = buildRun({ 'item-1': 'Old', 'item-2': undefined });

    expect(keepRunNoteDrafts(owner, { 'item-1': 'Deployed build 42', 'item-2': 'DNS checked' }, run, storage)).toBe(true);

    expect(takeKeptRunNoteDrafts({ userId: 'user-2', runId: 'run-1' }, run, storage)).toEqual({});
    expect(takeKeptRunNoteDrafts({ userId: 'user-1', runId: 'run-2' }, run, storage)).toEqual({});
    expect(takeKeptRunNoteDrafts(owner, run, storage)).toEqual({
      'item-1': 'Deployed build 42',
      'item-2': 'DNS checked',
    });
    expect(takeKeptRunNoteDrafts(owner, run, storage)).toEqual({});
  });

  // Restoring a draft over notes someone saved since would overwrite their text.
  it('drops a draft whose task notes changed on the server, or whose task is gone', () => {
    const storage = createStorage();
    keepRunNoteDrafts(
      owner,
      { 'item-1': 'Mine', 'item-2': 'Also mine', 'item-3': 'Removed task' },
      buildRun({ 'item-1': 'Old', 'item-2': 'Old', 'item-3': '' }),
      storage,
    );

    expect(takeKeptRunNoteDrafts(owner, buildRun({ 'item-1': 'Old', 'item-2': 'Teammate' }), storage)).toEqual({
      'item-1': 'Mine',
    });
  });

  it('keeps nothing when there are no drafts, and reports blocked storage', () => {
    const storage = createStorage();
    const run = buildRun({ 'item-1': 'Old' });

    expect(keepRunNoteDrafts(owner, {}, run, storage)).toBe(true);
    expect(storage.items.size).toBe(0);
    expect(keepRunNoteDrafts(owner, { 'item-1': 'Mine' }, run, blockedStorage)).toBe(false);
    expect(keepRunNoteDrafts(owner, { 'item-1': 'Mine' }, run, null)).toBe(false);
    expect(takeKeptRunNoteDrafts(owner, run, blockedStorage)).toEqual({});
  });

  it('ignores a stored value that is not a kept draft', () => {
    const storage = createStorage();
    const run = buildRun({ 'item-1': 'Old' });
    keepRunNoteDrafts(owner, { 'item-1': 'Mine' }, run, storage);
    const [key] = storage.items.keys();

    storage.items.set(key, '{not json');
    expect(takeKeptRunNoteDrafts(owner, run, storage)).toEqual({});
    storage.items.set(key, JSON.stringify({ notes: 42 }));
    expect(takeKeptRunNoteDrafts(owner, run, storage)).toEqual({});
  });
});
