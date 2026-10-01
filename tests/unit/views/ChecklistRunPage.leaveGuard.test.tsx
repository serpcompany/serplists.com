import { beforeEach, describe, expect, it, vi } from 'vitest';

const guardedWith = vi.hoisted(() => vi.fn());

vi.mock('@/lib/navigation/useUnsavedChangesGuard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/navigation/useUnsavedChangesGuard')>();
  return {
    ...actual,
    useUnsavedChangesGuard: (...args: Parameters<typeof actual.useUnsavedChangesGuard>) => {
      guardedWith(...args);
      return actual.useUnsavedChangesGuard(...args);
    },
  };
});

import { RUN_NOTES_UNSAVED_MESSAGE } from '@/features/run-execution/noteDrafts';

import { renderRunPage, twoTaskRun } from '../../support/checklistRunPage';

beforeEach(() => {
  guardedWith.mockClear();
});

describe('ChecklistRunPage leaving, which the one unsaved-changes guard asks about for every way out (the app shell, Back, Sign out)', () => {
  it('guards leaving while a task note lives only on the page, with the run notes message', async () => {
    await renderRunPage(twoTaskRun([false, false]), { selectedItemId: 'item-1', noteDrafts: { 'item-1': 'Half a note' } });

    expect(guardedWith).toHaveBeenCalledTimes(1);
    expect(guardedWith).toHaveBeenCalledWith(true, RUN_NOTES_UNSAVED_MESSAGE, expect.any(Function));
  });

  it('lets the user leave without asking once every note is saved', async () => {
    await renderRunPage(twoTaskRun([false, false]), { selectedItemId: 'item-1' });

    expect(guardedWith).toHaveBeenCalledWith(false, RUN_NOTES_UNSAVED_MESSAGE, expect.any(Function));
  });
});
