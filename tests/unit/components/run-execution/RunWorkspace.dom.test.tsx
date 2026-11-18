import { act, useState } from 'react';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RunWorkspace } from '@/components/run-execution/RunWorkspace';
import type { NoteDrafts } from '@/features/run-execution/noteDrafts';
import type { ChecklistRun } from '@/types/checklist';

import { buildRun } from '../../../fixtures/runExecutionFixtures';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

afterEach(cleanup);

async function renderTheWorkspace(run: ChecklistRun, firstSelected: string | null = null) {
  const onSaveNotes = vi.fn<(itemId: string, notes: string) => void>();
  const onSelectTask = vi.fn<(itemId: string) => void>();
  function Page() {
    const [selectedItemId, setSelectedItemId] = useState(firstSelected);
    const [noteDrafts, setNoteDrafts] = useState<NoteDrafts>({});
    const [shownRun, setShownRun] = useState(run);
    const saveNotes = async (itemId: string, notes: string) => {
      onSaveNotes(itemId, notes);
      setShownRun((current) => ({
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => (item.id === itemId ? { ...item, notes } : item)),
        })),
      }));
      setNoteDrafts(({ [itemId]: _saved, ...rest }) => rest);
      return true;
    };
    return (
      <RunWorkspace
        canUpdateRun
        completedTasks={1}
        noteDrafts={noteDrafts}
        onFinishRun={vi.fn()}
        onNoteDraftChange={(itemId, notes) => setNoteDrafts((drafts) => ({ ...drafts, [itemId]: notes }))}
        onSaveNotes={saveNotes}
        onSelectTask={(itemId) => {
          onSelectTask(itemId);
          setSelectedItemId(itemId);
        }}
        onToggleSubItem={vi.fn()}
        onToggleTask={vi.fn()}
        progress={50}
        run={shownRun}
        selectedItemId={selectedItemId}
        totalTasks={2}
      />
    );
  }
  await renderSettled(<Page />);
  return { onSaveNotes, onSelectTask };
}

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

const theTaskTitle = () => document.querySelector('[data-task-footer]')?.parentElement?.querySelector('h2')?.textContent;

describe('the run workspace', () => {
  it('opens the first task, then steps to the next task and back', async () => {
    await renderTheWorkspace(buildRun());

    expect(theTaskTitle()).toBe('First item');
    expect(screen.getByText('Task 1 of 2', { selector: '[data-slot="badge"]' })).toBeTruthy();

    await press('Next');
    expect(theTaskTitle()).toBe('Second item');
    expect(screen.getByRole('button', { name: 'Next' })).toHaveProperty('disabled', true);

    await press('Previous');
    expect(theTaskTitle()).toBe('First item');
    expect(screen.getByRole('button', { name: 'Previous' })).toHaveProperty('disabled', true);
  });

  it('opens a task picked from the progress list beside it', async () => {
    const workspace = await renderTheWorkspace(buildRun());

    const sidebar = screen.getByRole('navigation', { name: 'Run tasks' });
    await act(async () => {
      fireEvent.click(within(sidebar).getByRole('button', { name: /Second item/ }));
    });

    expect(workspace.onSelectTask).toHaveBeenCalledWith('item-2');
    expect(theTaskTitle()).toBe('Second item');
  });

  it('opens a task picked from the Tasks sheet on a phone', async () => {
    await renderTheWorkspace(buildRun());

    await press('Tasks');
    const sheet = await screen.findByRole('dialog', { name: 'Tasks' });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: /Second item/ }));
    });

    expect(theTaskTitle()).toBe('Second item');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Tasks' })).toBeNull();
    });
  });

  it('saves the notes typed for the open task', async () => {
    const workspace = await renderTheWorkspace(buildRun(), 'item-2');

    fireEvent.change(screen.getByRole('textbox', { name: 'Task notes' }), { target: { value: 'Shipped at noon' } });
    await press('Save notes');

    expect(workspace.onSaveNotes).toHaveBeenCalledWith('item-2', 'Shipped at noon');
  });

  it('says the notes were saved once the run holds them, until they are edited again', async () => {
    await renderTheWorkspace(buildRun(), 'item-2');

    fireEvent.change(screen.getByRole('textbox', { name: 'Task notes' }), { target: { value: 'Shipped at noon' } });
    await press('Save notes');

    expect(screen.getByText('Saved to this run')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save notes' })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByRole('textbox', { name: 'Task notes' }), { target: { value: 'Shipped at one' } });

    expect(screen.queryByText('Saved to this run')).toBeNull();
  });

  it('asks for a task when the selected one is not in the run, and when the run has none', async () => {
    await renderTheWorkspace(buildRun(), 'item-gone');

    expect(screen.getByText('Select a task to continue.')).toBeTruthy();
    expect(screen.queryByText(/^Task \d of/)).toBeNull();

    cleanup();
    await renderTheWorkspace(buildRun({ sections: [] }));

    expect(screen.getByText('Select a task to continue.')).toBeTruthy();
  });
});
