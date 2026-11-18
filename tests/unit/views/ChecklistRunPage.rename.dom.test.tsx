import { navigation } from '../../support/mockedNextNavigation';
import { baseRun, openTheRunPageInTheDom } from '../../support/checklistRunPage';
import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { countRunExecutionItems } from '@/features/run-execution/runExecutionMappers';
import type { RunExecutionActionResult } from '@/features/run-execution/runExecutionResult';
import { pressTheButton } from '../../support/pressTheButton';
import { inputNamed, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';

vi.mock('@/hooks/usePageVisit', async () => (await import('../../support/pageVisitMock')).pageVisitOfAUserStillOnThePage);

theInMemoryBrowserAsTheWindow();

const saveTitle = vi.fn<(title: string) => Promise<RunExecutionActionResult>>();

beforeEach(() => {
  saveTitle.mockReset();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => cleanup());

const openThePrivateRun = () =>
  openTheRunPageInTheDom({ counts: countRunExecutionItems(baseRun), run: baseRun, saveTitle, selectedItemId: 'item-1' });

const startRenaming = async () => {
  await openThePrivateRun();
  await pressTheButton('Rename');
  return inputNamed('Run title');
};

describe('Renaming a private Run', () => {
  it('starts from the current title and saves the new one', async () => {
    saveTitle.mockResolvedValue({ kind: 'ok' });
    const titleField = await startRenaming();
    expect(titleField.value).toBe('Website Launch Checklist');

    await typeInto(titleField, 'Website Launch, take two');
    await pressTheButton('Save title');

    expect(saveTitle).toHaveBeenCalledWith('Website Launch, take two');
    expect(toast.success).toHaveBeenCalledWith('Run title updated');
    expect(screen.queryByRole('textbox', { name: 'Run title' })).toBeNull();
  });

  it('closes the editor without a save when Enter leaves the title as it was', async () => {
    const titleField = await startRenaming();

    await typeInto(titleField, 'Website Launch Checklist  ');
    await act(async () => {
      fireEvent.keyDown(titleField, { key: 'Enter' });
    });

    expect(saveTitle).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Run title' })).toBeNull();
  });

  it('keeps the editor open and says why when the save fails', async () => {
    saveTitle.mockResolvedValue({ kind: 'error', message: 'Title is too long' });
    const titleField = await startRenaming();

    await typeInto(titleField, 'Another title');
    await pressTheButton('Save title');

    expect(toast.error).toHaveBeenCalledWith('Title is too long');
    expect(inputNamed('Run title').value).toBe('Another title');
  });

  it('keeps the editor open, saying nothing, when the save finds the run gone', async () => {
    saveTitle.mockResolvedValue({ kind: 'not_found' });
    const titleField = await startRenaming();

    await typeInto(titleField, 'Another title');
    await pressTheButton('Save title');

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(inputNamed('Run title').value).toBe('Another title');
  });

  it('drops the edit on Cancel', async () => {
    const titleField = await startRenaming();
    await typeInto(titleField, 'Another title');

    await pressTheButton('Cancel');
    await pressTheButton('Rename');

    expect(inputNamed('Run title').value).toBe('Website Launch Checklist');
    expect(navigation.url()).toBe('/dashboard/runs/run-1/');
  });
});
