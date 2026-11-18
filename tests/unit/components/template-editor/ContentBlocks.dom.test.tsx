import { clickTheButton, renderTheTemplateEditorPanels } from '../../../support/templateEditorPanels';
import { act } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TemplateEditorFormSource } from '@/lib/forms/templateEditorForm';

import { typeInto } from '../../../support/renderInTheDom';

afterEach(cleanup);

const withContents = (contents: unknown[]): TemplateEditorFormSource => ({
  title: 'Launch',
  sections: [{ id: 'section-1', title: 'Prepare', items: [{ id: 'task-1', title: 'Write notes', contents }] }],
});

async function openTheTask(contents: unknown[] = []) {
  const editor = await renderTheTemplateEditorPanels(withContents(contents));
  await clickTheButton('Write notes');
  const contentsOfTheTask = () => editor.values().sections[0]?.items[0]?.contents ?? [];
  return { ...editor, contentsOfTheTask };
}

async function addBlock(name: string) {
  const [addBlockButton] = screen.getAllByRole('button', { name: 'Add Block' });
  if (!addBlockButton) throw new Error('No Add Block button');
  await act(async () => {
    fireEvent.click(addBlockButton);
  });
  const item = await screen.findByRole('menuitem', { name });
  await act(async () => {
    fireEvent.click(item);
  });
}

describe('the content blocks of a task in the template editor', () => {
  it('writes the text typed into a Text block', async () => {
    const task = await openTheTask();

    await addBlock('Text');
    await typeInto(screen.getByLabelText('Text Content'), '**Bold** step');

    expect(task.contentsOfTheTask()).toEqual([expect.objectContaining({ type: 'text', value: '**Bold** step' })]);
  });

  it('writes the address typed into an Embed block and shows the link viewers get', async () => {
    const task = await openTheTask();

    await addBlock('Embed');
    await typeInto(screen.getByLabelText('Embed Code or URL'), 'https://www.youtube.com/embed/abc');

    expect(task.contentsOfTheTask()).toEqual([
      expect.objectContaining({ type: 'embed', value: 'https://www.youtube.com/embed/abc' }),
    ]);
    expect(screen.getByText('Embed URL: https://www.youtube.com/embed/abc')).toBeTruthy();
  });

  it('removes a block with its remove button', async () => {
    const task = await openTheTask([
      { id: 'content-1', type: 'text', value: 'Keep' },
      { id: 'content-2', type: 'embed', value: 'https://example.com' },
    ]);

    await clickTheButton('Remove Embed block');

    expect(task.contentsOfTheTask().map((content) => content.id)).toEqual(['content-1']);
    expect(screen.getByText('Text', { selector: 'span' })).toBeTruthy();
  });

  it('writes sub-task titles, adds one with Enter and focuses it, and removes one', async () => {
    const task = await openTheTask([
      { id: 'content-1', type: 'subItems', value: '', subItems: [{ id: 'sub-1', title: 'Draft' }] },
    ]);
    const subItemsOfTheBlock = () => task.contentsOfTheTask()[0]?.subItems?.map((subItem) => subItem.title);

    expect(screen.getByRole('button', { name: 'Remove sub-task 1' })).toHaveProperty('disabled', true);
    await typeInto(screen.getByLabelText('Sub-task 1'), 'Draft notes');
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Sub-task 1'), { key: 'Enter' });
    });

    expect(subItemsOfTheBlock()).toEqual(['Draft notes', '']);
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText('Sub-task 2'));
    });

    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText('Sub-task 2'), { key: 'a' });
    });
    expect(subItemsOfTheBlock()).toEqual(['Draft notes', '']);
    await clickTheButton('Add Sub-task');
    expect(subItemsOfTheBlock()).toEqual(['Draft notes', '', '']);

    await clickTheButton('Remove sub-task 1');

    expect(subItemsOfTheBlock()).toEqual(['', '']);
  });

  it('heads each media block with its own kind and icon', async () => {
    await openTheTask([
      { id: 'content-1', type: 'image', value: '' },
      { id: 'content-2', type: 'video', value: '' },
      { id: 'content-3', type: 'file', value: '' },
    ]);

    const legends = [...document.querySelectorAll('legend')].map((legend) => ({
      name: legend.textContent,
      icon: legend.querySelector('svg')?.getAttribute('class')?.match(/lucide-(image|video|file) /)?.[1],
    }));

    expect(legends).toEqual([
      { name: 'Image', icon: 'image' },
      { name: 'Video', icon: 'video' },
      { name: 'File', icon: 'file' },
    ]);
  });
});
