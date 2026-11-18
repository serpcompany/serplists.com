import {
  clickTheButton,
  renderTheTemplateEditorPanels,
  thePanelHeading,
} from '../../../support/templateEditorPanels';
import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { launchOutline } from '../../../fixtures/templateEditorOutline';
import { inputNamed } from '../../../support/renderInTheDom';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const launch = launchOutline({ secondTaskTitle: '' });

const outlineButtons = (): string[] =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent)
    .filter((text) => text !== '');

const press = (element: HTMLElement, key: string) =>
  act(async () => {
    fireEvent.keyDown(element, { key });
  });

const theOnlyTextbox = (): HTMLInputElement => {
  const field = screen.getAllByRole('textbox').find((element) => element.closest('[data-slot="template-outline"]'));
  if (!(field instanceof HTMLInputElement)) throw new Error('No title field is open in the outline');
  return field;
};

describe('the template editor outline', () => {
  it('names an untitled task by its position', async () => {
    await renderTheTemplateEditorPanels(launch);

    expect(outlineButtons()).toEqual(expect.arrayContaining(['Write notes', 'Task 2', 'Tag release']));
  });

  it('adds a section at the end and opens it', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Add section');

    expect(editor.values().sections.map((section) => section.title)).toEqual(['Prepare', 'Ship', '']);
    expect(thePanelHeading()).toBe('Section Settings');
    expect(inputNamed('Section Title').value).toBe('');
  });

  it('removes a section and selects the one before it', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Remove Ship');

    expect(editor.values().sections.map((section) => section.title)).toEqual(['Prepare']);
    expect(inputNamed('Section Title').value).toBe('Prepare');
  });

  it('keeps the last section and says why', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'One', sections: [{ id: 's', title: 'Only', items: [] }] });

    await clickTheButton('Remove Only');

    expect(toast.error).toHaveBeenCalledWith('You must have at least one section');
    expect(editor.values().sections).toHaveLength(1);
  });

  it('adds a task to a collapsed section, expanding it and opening the new task', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Collapse Ship');
    expect(screen.queryByRole('button', { name: 'Deploy' })).toBeNull();

    await clickTheButton('Add task to Ship');

    expect(screen.getByRole('button', { name: 'Collapse Ship' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeTruthy();
    expect(editor.values().sections[1]?.items.map((item) => item.title)).toEqual(['Deploy', '']);
    expect(thePanelHeading()).toBe('Task Details');
  });

  it('collapses a section to hide its tasks and expands it again', async () => {
    await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Collapse Prepare');
    expect(screen.queryByRole('button', { name: 'Write notes' })).toBeNull();
    await clickTheButton('Expand Prepare');

    expect(screen.getByRole('button', { name: 'Write notes' })).toBeTruthy();
  });

  it('adds a task from the Add task row of an open section', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    const [, shipAddTask] = screen.getAllByRole('button', { name: 'Add task' });
    if (!shipAddTask) throw new Error('No Add task row for Ship');
    await act(async () => {
      fireEvent.click(shipAddTask);
    });

    expect(editor.values().sections[1]?.items).toHaveLength(2);
    expect(inputNamed('Task Title').value).toBe('');
  });

  it('removes a task and returns to its section', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Tag release');
    await clickTheButton('Remove Write notes');

    expect(editor.values().sections[0]?.items.map((item) => item.id)).toEqual(['task-2', 'task-3']);
    expect(thePanelHeading()).toBe('Section Settings');
  });

  it('renames a section on double-click, saving on Enter', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await act(async () => {
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Ship' }));
    });
    fireEvent.change(theOnlyTextbox(), { target: { value: 'Release' } });
    await press(theOnlyTextbox(), 'Enter');

    expect(editor.values().sections[1]?.title).toBe('Release');
    expect(screen.getByRole('button', { name: 'Release' })).toBeTruthy();
  });

  it('saves a section title when its field loses focus', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await act(async () => {
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Prepare' }));
    });
    fireEvent.change(theOnlyTextbox(), { target: { value: 'Get ready' } });
    await act(async () => {
      fireEvent.blur(theOnlyTextbox());
    });

    expect(editor.values().sections[0]?.title).toBe('Get ready');
  });

  it('renames a task on double-click, saving when the field loses focus', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await act(async () => {
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Task 2' }));
    });
    expect(theOnlyTextbox().value).toBe('Task 2');
    fireEvent.change(theOnlyTextbox(), { target: { value: 'Bump version' } });
    await act(async () => {
      fireEvent.blur(theOnlyTextbox());
    });

    expect(editor.values().sections[0]?.items[1]?.title).toBe('Bump version');
  });

  it('saves a task title on Enter and drops an edit on Escape', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await act(async () => {
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Deploy' }));
    });
    fireEvent.change(theOnlyTextbox(), { target: { value: 'Deploy to production' } });
    await press(theOnlyTextbox(), 'Enter');
    await act(async () => {
      fireEvent.doubleClick(screen.getByRole('button', { name: 'Deploy to production' }));
    });
    fireEvent.change(theOnlyTextbox(), { target: { value: 'Thrown away' } });
    await press(theOnlyTextbox(), 'a');
    await press(theOnlyTextbox(), 'Escape');

    expect(editor.values().sections[1]?.items[0]?.title).toBe('Deploy to production');
    expect(screen.getByRole('button', { name: 'Deploy to production' })).toBeTruthy();
  });

  it('moves a task with its move buttons, keeping the selected task selected', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Write notes');
    await clickTheButton('Move Write notes down');

    expect(editor.values().sections[0]?.items.map((item) => item.id)).toEqual(['task-2', 'task-1', 'task-3']);
    expect(inputNamed('Task Title').value).toBe('Write notes');
  });

  it('moves a section with its move buttons while a task in it stays selected', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Deploy');
    await clickTheButton('Move Ship up');

    expect(editor.values().sections.map((section) => section.id)).toEqual(['section-2', 'section-1']);
    expect(inputNamed('Task Title').value).toBe('Deploy');
  });
});
