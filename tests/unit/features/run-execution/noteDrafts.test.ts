import { describe, expect, it, vi } from 'vitest';

import {
  applyNoteDrafts,
  applyUnsavedNotesWarning,
  confirmLeaveWithUnsavedNotes,
  pruneNoteDrafts,
  RUN_NOTES_UNSAVED_MESSAGE,
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

describe('pruneNoteDrafts', () => {
  it('keeps text typed while a notes save was in flight', () => {
    // The user saved "abc", kept typing "def", and the save then returned "abc".
    const drafts = { 'item-1': 'abcdef' };

    expect(pruneNoteDrafts(drafts, buildRun({ 'item-1': 'abc' }))).toEqual({ 'item-1': 'abcdef' });
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

describe('applyUnsavedNotesWarning', () => {
  it('asks the browser to confirm leaving only while notes are unsaved', () => {
    const event = { preventDefault: vi.fn(), returnValue: 'unset' as unknown };

    applyUnsavedNotesWarning(event, false);
    expect(event.preventDefault).not.toHaveBeenCalled();

    applyUnsavedNotesWarning(event, true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe('');
  });
});

describe('confirmLeaveWithUnsavedNotes', () => {
  it('asks before leaving only while notes are unsaved', () => {
    const confirmDialog = vi.fn(() => false);

    expect(confirmLeaveWithUnsavedNotes(false, confirmDialog)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(confirmLeaveWithUnsavedNotes(true, confirmDialog)).toBe(false);
    expect(confirmDialog).toHaveBeenCalledWith(RUN_NOTES_UNSAVED_MESSAGE);
  });
});

