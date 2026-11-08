import { clickTheButton, renderTheTemplateEditorPanels } from '../../../support/templateEditorPanels';
import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { launchOutline } from '../../../fixtures/templateEditorOutline';
import { inputNamed } from '../../../support/renderInTheDom';

afterEach(cleanup);

const launch = launchOutline({ moreSections: [{ id: 'section-3', title: 'Announce', items: [] }] });

const dataTransfer = () => ({ dropEffect: '', effectAllowed: '', setData: () => undefined });

const dropZoneOf = (label: string, kind: 'section' | 'task'): HTMLElement => {
  const handle = screen.getByRole('button', { name: `Drag ${label}` });
  const row = kind === 'task' ? handle.parentElement : handle.parentElement?.parentElement;
  if (!(row instanceof HTMLElement)) throw new Error(`No drop zone around ${label}`);
  return row;
};

async function drag(label: string, kind: 'section' | 'task', onto: string, overFirst: string[] = []) {
  await act(async () => {
    fireEvent.dragStart(screen.getByRole('button', { name: `Drag ${label}` }), { dataTransfer: dataTransfer() });
  });
  for (const over of [...overFirst, onto]) {
    await act(async () => {
      fireEvent.dragOver(dropZoneOf(over, kind), { dataTransfer: dataTransfer() });
    });
  }
  const indicator = dropZoneOf(onto, kind).dataset['dropIndicator'];
  await act(async () => {
    fireEvent.drop(dropZoneOf(onto, kind), { dataTransfer: dataTransfer() });
  });
  return indicator;
}

describe('dragging in the template editor outline', () => {
  it('drops a section after a later section, marking where it will land', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    const indicator = await drag('Prepare', 'section', 'Announce', ['Ship', 'Announce']);

    expect(indicator).toBe('section-after');
    expect(editor.values().sections.map((section) => section.id)).toEqual(['section-2', 'section-3', 'section-1']);
    expect(dropZoneOf('Prepare', 'section').dataset['dropIndicator']).toBeUndefined();
  });

  it('drops a section before an earlier one and keeps the selected section selected', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Announce');
    const indicator = await drag('Announce', 'section', 'Prepare');

    expect(indicator).toBe('section-before');
    expect(editor.values().sections.map((section) => section.title)).toEqual(['Announce', 'Prepare', 'Ship']);
    expect(inputNamed('Section Title').value).toBe('Announce');
  });

  it('drops a task before an earlier task in its section, the selected task moving with it', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Tag release');
    const indicator = await drag('Tag release', 'task', 'Write notes', ['Bump version', 'Bump version']);

    expect(indicator).toBe('task-before');
    expect(editor.values().sections[0]?.items.map((item) => item.id)).toEqual(['task-3', 'task-1', 'task-2']);
    expect(inputNamed('Task Title').value).toBe('Tag release');
  });

  it('drops a task after a later one while another section is selected', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    await clickTheButton('Ship');
    const indicator = await drag('Write notes', 'task', 'Tag release');

    expect(indicator).toBe('task-after');
    expect(editor.values().sections[0]?.items.map((item) => item.id)).toEqual(['task-2', 'task-3', 'task-1']);
    expect(inputNamed('Section Title').value).toBe('Ship');
  });

  it('marks nothing and moves nothing when a section is dropped on itself', async () => {
    const editor = await renderTheTemplateEditorPanels(launch);

    const indicator = await drag('Ship', 'section', 'Ship');

    expect(indicator).toBeUndefined();
    expect(editor.values().sections.map((section) => section.id)).toEqual(['section-1', 'section-2', 'section-3']);
  });
});
