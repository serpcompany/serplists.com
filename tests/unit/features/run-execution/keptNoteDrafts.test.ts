import { describe, expect, it } from 'vitest';

import {
  keepRunNoteDrafts,
  takeKeptRunNoteDrafts,
  type KeptNoteDraftStorage,
} from '@/features/run-execution/keptNoteDrafts';

import { memoryStorage as createStorage, storageThatThrows } from '../../../fixtures/memoryStorage';
import { runWithNotes as buildRun } from '../../../fixtures/runExecutionFixtures';

const blockedStorage: KeptNoteDraftStorage = storageThatThrows;

const owner = { userId: 'user-1', runId: 'run-1' };

describe('run note drafts kept when the session ends in the background, for the run page to offer back after sign-in', () => {
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

  it('drops a draft whose task notes changed on the server, which restoring it would overwrite, or whose task is gone', () => {
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
