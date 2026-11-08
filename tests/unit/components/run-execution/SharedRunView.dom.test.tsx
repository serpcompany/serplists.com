import { navigation } from '../../../support/mockedNextNavigation';
import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SharedRunView } from '@/components/run-execution/SharedRunView';

import { sharedRunOf, sharedRunViewProps } from '../../../fixtures/sharedRunView';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

theInMemoryBrowserAsTheWindow();

afterEach(cleanup);

const run = sharedRunOf([
  {
    id: 'task-1',
    title: 'Collect the brief',
    isCompleted: false,
    contents: [{ id: 'block-1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Budget', isCompleted: false }] }],
  },
]);

async function renderTheSharedRun(noteDrafts: Record<string, string | undefined> = {}) {
  const props = sharedRunViewProps(run, { noteDrafts });
  navigation.reset('/share/abc123/');
  await renderSettled(<SharedRunView {...props} />);
  return props;
}

const click = (element: HTMLElement) =>
  act(async () => {
    fireEvent.click(element);
  });

describe('working through a shared run', () => {
  it('ticks a task and its sub-task for the visitor', async () => {
    const props = await renderTheSharedRun();

    await click(screen.getByRole('checkbox', { name: /Collect the brief/ }));
    await click(screen.getByRole('checkbox', { name: 'Budget' }));

    expect(props.onToggleTask).toHaveBeenCalledWith('task-1', true);
    expect(props.onToggleSubItem).toHaveBeenCalledWith('task-1', 0, 0, true);
  });

  it("hands the visitor's notes to the page and saves them for the task", async () => {
    const props = await renderTheSharedRun({ 'task-1': 'Budget is 10k' });

    fireEvent.change(screen.getByRole('textbox', { name: 'Task notes' }), { target: { value: 'Budget is 12k' } });
    await click(screen.getByRole('button', { name: 'Save notes' }));

    expect(props.onNoteDraftChange).toHaveBeenCalledWith('task-1', 'Budget is 12k');
    expect(props.onSaveNotes).toHaveBeenCalledWith('task-1', 'Budget is 10k');
  });
});
