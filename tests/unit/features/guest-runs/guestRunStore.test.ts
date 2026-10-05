import { describe, expect, it, vi } from 'vitest';

import {
  readGuestRun,
  readGuestRunStatus,
  removeGuestRun,
  saveGuestRun,
  startGuestRun,
  subscribeToGuestRuns,
} from '@/features/guest-runs/guestRunStore';
import { isApiError } from '@/lib/api-errors';
import { RUN_TITLE_MAX } from '@/lib/schemas/nameLimits';
import { calculateSectionsProgress } from '@/lib/utils/checklistSections';
import type { ChecklistRun } from '@/types/checklist';

import { GUEST_RUN_STORAGE_KEY, guestRunTemplate, otherGuestRunTemplate } from '../../../support/guestRuns';
import { createStorage } from '../../../support/inMemoryBrowser';
import { firstOf, taskAt } from '../../../support/elements';

const completionOf = (run: ChecklistRun) =>
  run.sections.flatMap((section) =>
    section.items.map((item) => [
      item.id,
      item.isCompleted,
      item.contents?.flatMap((content) => content.subItems?.map((subItem) => subItem.isCompleted) ?? []) ?? [],
    ]),
  );

const tickFirstTask = (run: ChecklistRun): ChecklistRun => {
  const sections = run.sections.map((section, sectionIndex) => ({
    ...section,
    items: section.items.map((item, itemIndex) =>
      sectionIndex === 0 && itemIndex === 1 ? { ...item, isCompleted: true, notes: 'Bought on Friday' } : item,
    ),
  }));
  return { ...run, progress: calculateSectionsProgress(sections), sections };
};

const expectEditConflict = (save: () => unknown) => {
  try {
    save();
  } catch (error) {
    expect(isApiError(error) && error.code).toBe('edit_conflict');
    return;
  }
  throw new Error('The save went through');
};

describe('starting a guest run', () => {
  it("copies the Template's sections into a new in-progress run with every task and Sub-task unticked", () => {
    const storage = createStorage();

    const run = startGuestRun(guestRunTemplate, 'Lake trip', storage);

    expect(run).toMatchObject({ templateId: 'template-camping', title: 'Lake trip', status: 'in_progress', revision: 1, progress: 0 });
    expect(completionOf(run)).toEqual([
      ['task-tent', false, [false, false]],
      ['task-food', false, []],
      ['task-lock', false, []],
    ]);
    expect(readGuestRun('template-camping', storage)).toEqual(run);
    expect(readGuestRunStatus('template-camping', storage)).toBe('in_progress');
  });

  it('names a run left unnamed after the Template and the time, as the Start a Run dialog does, and cuts a long name to the limit', () => {
    const storage = createStorage();

    expect(startGuestRun(guestRunTemplate, undefined, storage).title).toMatch(/^Weekend Camping - \S/);
    removeGuestRun('template-camping', storage);
    expect(startGuestRun(guestRunTemplate, 'x'.repeat(RUN_TITLE_MAX + 20), storage).title).toHaveLength(RUN_TITLE_MAX);
  });

  it('keeps one active run per Template: starting again returns the run in progress, with its progress', () => {
    const storage = createStorage();
    const first = startGuestRun(guestRunTemplate, 'Lake trip', storage);
    const ticked = saveGuestRun(tickFirstTask(first), storage);

    const again = startGuestRun(guestRunTemplate, 'Another trip', storage);

    expect(again).toEqual(ticked);
    expect(taskAt(again, 0, 1)).toMatchObject({ isCompleted: true, notes: 'Bought on Friday' });
  });

  it('starts a fresh run once the last one is completed, in place of it', () => {
    const storage = createStorage();
    const first = startGuestRun(guestRunTemplate, 'Lake trip', storage);
    saveGuestRun({ ...first, status: 'completed', completedAt: '2026-10-05T10:00:00.000Z' }, storage);

    const fresh = startGuestRun(guestRunTemplate, 'Second trip', storage);

    expect(fresh.id).not.toBe(first.id);
    expect(readGuestRun('template-camping', storage)).toMatchObject({ id: fresh.id, status: 'in_progress', title: 'Second trip' });
  });

  it("keeps each Template's run apart", () => {
    const storage = createStorage();

    const camping = startGuestRun(guestRunTemplate, 'Lake trip', storage);
    const moving = startGuestRun(otherGuestRunTemplate, 'New flat', storage);

    expect(readGuestRun('template-camping', storage)?.id).toBe(camping.id);
    expect(readGuestRun('template-moving', storage)?.id).toBe(moving.id);
    removeGuestRun('template-moving', storage);
    expect(readGuestRunStatus('template-moving', storage)).toBe('none');
    expect(readGuestRunStatus('template-camping', storage)).toBe('in_progress');
  });
});

describe('saving a guest run', () => {
  it('stores ticks, notes and completion with the next revision', () => {
    const storage = createStorage();
    const run = startGuestRun(guestRunTemplate, 'Lake trip', storage);

    const saved = saveGuestRun(tickFirstTask(run), storage);
    const completed = saveGuestRun({ ...saved, status: 'completed', completedAt: '2026-10-05T10:00:00.000Z' }, storage);

    expect(saved.revision).toBe(2);
    expect(completed).toMatchObject({ completedAt: '2026-10-05T10:00:00.000Z', progress: 20, revision: 3, status: 'completed' });
    expect(readGuestRun('template-camping', storage)).toEqual(completed);
    expect(taskAt(completed, 0, 1)).toMatchObject({ isCompleted: true, notes: 'Bought on Friday' });
  });

  it('refuses a save made on an older revision, as another tab saved first, and keeps what that tab stored', () => {
    const storage = createStorage();
    const opened = startGuestRun(guestRunTemplate, 'Lake trip', storage);
    const savedInAnotherTab = saveGuestRun(tickFirstTask(opened), storage);

    expectEditConflict(() => saveGuestRun({ ...opened, title: 'Stale tab' }, storage));
    expect(readGuestRun('template-camping', storage)).toEqual(savedInAnotherTab);
  });

  it('refuses a save of a run that was deleted, or replaced by a new run, since then', () => {
    const storage = createStorage();
    const opened = startGuestRun(guestRunTemplate, 'Lake trip', storage);
    removeGuestRun('template-camping', storage);

    expectEditConflict(() => saveGuestRun(tickFirstTask(opened), storage));
    expect(readGuestRun('template-camping', storage)).toBeNull();

    const replacement = startGuestRun(guestRunTemplate, 'New trip', storage);
    expectEditConflict(() => saveGuestRun(tickFirstTask(opened), storage));
    expect(readGuestRun('template-camping', storage)).toEqual(replacement);
  });
});

describe('reading a guest run back', () => {
  it.each([
    ['text that is not JSON', '{not json'],
    ['another format', JSON.stringify({ format: 2, run: {} })],
    ['a run with no sections', JSON.stringify({ format: 1, run: { id: 'run-1', templateId: 'template-camping', title: 'Trip', status: 'in_progress', startedAt: '2026-10-05', revision: 1 } })],
    ['a status runs never have', JSON.stringify({ format: 1, run: { id: 'run-1', templateId: 'template-camping', title: 'Trip', status: 'paused', startedAt: '2026-10-05', revision: 1, sections: [] } })],
    ["another Template's run under this Template's key", JSON.stringify({ format: 1, run: { id: 'run-1', templateId: 'template-moving', title: 'Trip', status: 'in_progress', startedAt: '2026-10-05', revision: 1, sections: [] } })],
  ])('reads %s as no run', (_label, stored) => {
    const storage = createStorage();
    storage.setItem(GUEST_RUN_STORAGE_KEY, stored);

    expect(readGuestRun('template-camping', storage)).toBeNull();
    expect(readGuestRunStatus('template-camping', storage)).toBe('none');
  });

  it('starts a fresh run over one it cannot read', () => {
    const storage = createStorage();
    storage.setItem(GUEST_RUN_STORAGE_KEY, '{not json');

    const run = startGuestRun(guestRunTemplate, 'Lake trip', storage);

    expect(readGuestRun('template-camping', storage)).toEqual(run);
  });
});

describe('telling the pages about a guest run that changed in this tab', () => {
  it('calls each subscriber when a run starts, saves or is deleted, until it unsubscribes', () => {
    const storage = createStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeToGuestRuns(listener);

    const run = startGuestRun(guestRunTemplate, 'Lake trip', storage);
    saveGuestRun(tickFirstTask(run), storage);
    removeGuestRun('template-camping', storage);
    unsubscribe();
    startGuestRun(guestRunTemplate, 'Lake trip', storage);

    expect(listener).toHaveBeenCalledTimes(3);
    expect(firstOf(listener.mock.calls)).toEqual([]);
  });
});
