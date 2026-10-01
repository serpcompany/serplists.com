import { describe, expect, it } from 'vitest';

import {
  applyNoteDrafts,
  draftedNotesChanged,
  hasNoteDraftFor,
  pruneNoteDrafts,
  updateNoteDraft,
} from '@/features/run-execution/noteDrafts';
import type { ChecklistRun } from '@/types/checklist';

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

describe('updateNoteDraft', () => {
  it('keeps a draft that differs from the saved notes', () => {
    expect(updateNoteDraft({}, 'item-1', 'Deployed build 42', undefined)).toEqual({
      'item-1': 'Deployed build 42',
    });
  });

  it('drops the draft once it matches the saved notes again, treating undefined as empty', () => {
    expect(updateNoteDraft({ 'item-1': 'x' }, 'item-1', '', undefined)).toEqual({});
    expect(updateNoteDraft({ 'item-1': 'x' }, 'item-1', 'saved', 'saved')).toEqual({});
  });
});

describe('hasNoteDraftFor', () => {
  it('is true only for a draft that differs from the notes the run holds, treating undefined as empty', () => {
    const run = buildRun({ 'item-1': 'saved', 'item-2': undefined });

    expect(hasNoteDraftFor({ 'item-1': 'changed' }, run, 'item-1')).toBe(true);
    expect(hasNoteDraftFor({ 'item-1': 'saved' }, run, 'item-1')).toBe(false);
    expect(hasNoteDraftFor({ 'item-2': '' }, run, 'item-2')).toBe(false);
    expect(hasNoteDraftFor({ 'item-2': 'new' }, run, 'item-1')).toBe(false);
  });
});

describe('pruneNoteDrafts', () => {
  it('keeps text typed while a notes save was in flight', () => {
    const typedOnWhileTheSaveOfAbcWasInFlight = { 'item-1': 'abcdef' };
    const runTheSaveReturned = buildRun({ 'item-1': 'abc' });

    expect(pruneNoteDrafts(typedOnWhileTheSaveOfAbcWasInFlight, runTheSaveReturned)).toEqual({ 'item-1': 'abcdef' });
  });

  it('clears a draft once the saved notes match it', () => {
    expect(pruneNoteDrafts({ 'item-1': 'abc' }, buildRun({ 'item-1': 'abc' }))).toEqual({});
  });

  it('keeps a dirty draft when the saved notes change for another reason', () => {
    const drafts = { 'item-1': 'my draft' };

    expect(pruneNoteDrafts(drafts, buildRun({ 'item-1': 'changed over MCP' }))).toEqual(drafts);
  });

  it('drops drafts for tasks that are no longer in the run', () => {
    expect(pruneNoteDrafts({ gone: 'x' }, buildRun({ 'item-1': undefined }))).toEqual({});
  });
});

describe('applyNoteDrafts', () => {
  it('writes drafts into a copy of the run, optionally only for some tasks', () => {
    const run = buildRun({ 'item-1': undefined, 'item-2': 'old' });
    const drafts = { 'item-1': 'one', 'item-2': 'two' };

    const onlyFirst = applyNoteDrafts(run, drafts, ['item-1']);
    expect(onlyFirst.sections[0].items.map((item) => item.notes)).toEqual(['one', 'old']);
    expect(applyNoteDrafts(run, drafts).sections[0].items.map((item) => item.notes)).toEqual(['one', 'two']);
    expect(run.sections[0].items[0].notes).toBeUndefined();
  });
});

describe('draftedNotesChanged', () => {
  const before = buildRun({ a: 'old', b: undefined, c: 'same' });

  it('is true only when a drafted task has different saved notes in the newer run', () => {
    const after = buildRun({ a: 'teammate', b: 'teammate', c: 'same' });
    expect(draftedNotesChanged({ a: 'mine' }, before, after)).toBe(true);
    expect(draftedNotesChanged({ c: 'mine' }, before, after)).toBe(false);
    expect(draftedNotesChanged({}, before, after)).toBe(false);
  });

  it('checks only the given tasks when asked', () => {
    const after = buildRun({ a: 'teammate', b: undefined, c: 'same' });
    expect(draftedNotesChanged({ a: 'mine', c: 'mine' }, before, after, ['c'])).toBe(false);
    expect(draftedNotesChanged({ a: 'mine', c: 'mine' }, before, after, ['a'])).toBe(true);
  });
});
