import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RunExecutionActionResult } from '@/features/run-execution/runExecutionResult';
import { useRunPageActions } from '@/features/run-execution/useRunPageActions';
import { FORM_INCOMPLETE_CODE } from '@/lib/schemas/formValidation';

vi.mock('@/hooks/usePageVisit', async () => (await import('../../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const REFUSED: RunExecutionActionResult = {
  kind: 'error',
  code: FORM_INCOMPLETE_CODE,
  message: "Finish this task's form first. Client name: Fill in this field.",
};

const saves = () => ({
  completeRun: vi.fn(async (): Promise<RunExecutionActionResult> => ({ kind: 'ok' })),
  saveFormAnswer: vi.fn(async (): Promise<RunExecutionActionResult> => ({ kind: 'ok' })),
  saveItemNotes: vi.fn(async (): Promise<RunExecutionActionResult> => ({ kind: 'ok' })),
  toggleItem: vi.fn(async (): Promise<RunExecutionActionResult> => REFUSED),
  toggleSubItem: vi.fn(async (): Promise<RunExecutionActionResult> => ({ kind: 'ok' })),
});

const settle = () => act(async () => {
  await Promise.resolve();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the run page when a task is refused for its form', () => {
  it('counts each refused attempt on that task, so the page shows its messages and moves focus again, and says why', async () => {
    const page = saves();
    const { result } = renderHook(() => useRunPageActions(page));
    expect(result.current.formAttempt).toBeNull();

    act(() => result.current.toggleTask('item-form', true));
    await settle();
    expect(result.current.formAttempt).toEqual({ count: 1, itemId: 'item-form' });
    expect(toast.error).toHaveBeenCalledWith(REFUSED.message);

    act(() => result.current.toggleTask('item-form', true));
    await settle();
    expect(result.current.formAttempt).toEqual({ count: 2, itemId: 'item-form' });
  });

  it('leaves the form alone for any other failure', async () => {
    const page = saves();
    page.toggleItem.mockResolvedValue({ kind: 'error', message: 'Unable to save your progress.' });
    const { result } = renderHook(() => useRunPageActions(page));

    act(() => result.current.toggleTask('item-form', true));
    await settle();

    expect(result.current.formAttempt).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Unable to save your progress.');
  });

  it('saves an answer through the run and says when it could not be saved', async () => {
    const page = saves();
    page.saveFormAnswer.mockResolvedValueOnce({ kind: 'ok' }).mockResolvedValueOnce({ kind: 'error', message: 'Unable to save your answer.' });
    const { result } = renderHook(() => useRunPageActions(page));

    act(() => result.current.saveFormAnswer('item-form', 'field-name', 'Acme'));
    await settle();
    expect(page.saveFormAnswer).toHaveBeenCalledWith('item-form', 'field-name', 'Acme');
    expect(toast.error).not.toHaveBeenCalled();

    act(() => result.current.saveFormAnswer('item-form', 'field-name', 'Acme Inc'));
    await settle();
    expect(toast.error).toHaveBeenCalledWith('Unable to save your answer.');
  });
});

describe('the run page after a save', () => {
  it('offers to complete the run once the last Sub-task is ticked', async () => {
    const page = saves();
    page.toggleSubItem.mockResolvedValue({ kind: 'ok', shouldPromptComplete: true });
    const { result } = renderHook(() => useRunPageActions(page));

    act(() => result.current.toggleSubItem('item-1', 0, 1, true));
    await settle();

    expect(page.toggleSubItem).toHaveBeenCalledWith('item-1', 0, 1, true);
    expect(result.current.completeDialog.open).toBe(true);
  });

  it('keeps the notes editor open only for notes that were not saved, and says why', async () => {
    const page = saves();
    page.saveItemNotes
      .mockResolvedValueOnce({ kind: 'ok' })
      .mockResolvedValueOnce({ kind: 'ignored' })
      .mockResolvedValueOnce({ kind: 'error', message: 'This run changed elsewhere.' })
      .mockResolvedValueOnce({ kind: 'not_found' });
    const { result } = renderHook(() => useRunPageActions(page));

    const outcomes = [];
    for (const notes of ['Saved', 'Superseded', 'Conflicted', 'Gone']) {
      outcomes.push(await result.current.saveNotes('item-1', notes));
    }

    expect(outcomes).toEqual([true, false, false, false]);
    expect(vi.mocked(toast.error).mock.calls).toEqual([['This run changed elsewhere.'], ['Unable to save task notes.']]);
  });

  it('says completion could not be saved, and keeps the dialog open, when the server gives no reason', async () => {
    const page = saves();
    page.completeRun.mockResolvedValue({ kind: 'error', message: '' });
    const { result } = renderHook(() => useRunPageActions(page));
    act(() => result.current.openCompleteDialog());

    act(() => result.current.completeDialog.onComplete());
    await settle();

    expect(toast.error).toHaveBeenCalledWith('Unable to save completion. Please try again.');
    expect(result.current.completeDialog.open).toBe(true);
    expect(result.current.completeDialog.completing).toBe(false);
  });
});

