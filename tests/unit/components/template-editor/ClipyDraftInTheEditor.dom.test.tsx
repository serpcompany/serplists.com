import { clickTheButton, renderTheTemplateEditorPanels } from '../../../support/templateEditorPanels';
import { act } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { templateEditorFormSchema } from '@/lib/forms/templateEditorForm';

import { inputNamed } from '../../../support/renderInTheDom';

afterEach(cleanup);

const draftFromTheApi = templateEditorFormSchema.parse({
  title: 'From the recording',
  description: '',
  templateType: 'checklist',
  categories: [],
  tags: [],
  isPublic: false,
  seoTitle: '',
  seoDescription: '',
  seoUrl: '',
  sections: [
    {
      id: 'section-1',
      title: 'Recorded steps',
      items: [
        { id: 'task-1', title: 'Open the settings' },
        {
          id: 'task-2',
          title: 'Fill the form',
          contents: [
            { id: 'content-1', type: 'subItems', value: '' },
            { id: 'content-2', type: 'form', value: '', fields: [{ id: 'field-1', kind: 'select', label: 'Plan', required: false }] },
          ],
        },
      ],
    },
  ],
});

async function editTheDraft() {
  const editor = await renderTheTemplateEditorPanels({ title: '' });
  await act(async () => {
    editor.form().reset(draftFromTheApi, { keepDefaultValues: true });
  });
  return editor;
}

describe('a Clipy draft, whose tasks may leave out what a stored Template always has, in the editor', () => {
  it('shows a task with no description and no blocks as empty', async () => {
    await editTheDraft();

    await clickTheButton('Open the settings');

    expect(inputNamed('Task Title').value).toBe('Open the settings');
    expect(screen.getByLabelText('Description (Optional)')).toHaveProperty('value', '');
    expect(screen.getByText('No content blocks yet')).toBeTruthy();
  });

  it('shows a sub-task block with no sub-tasks and a dropdown with no options as empty lists', async () => {
    await editTheDraft();

    await clickTheButton('Fill the form');

    expect(screen.queryByLabelText('Sub-task 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Sub-task' })).toBeTruthy();
    expect(inputNamed('Field 1 Label').value).toBe('Plan');
    expect(screen.queryByLabelText('Field 1 option 1')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add option' })).toBeTruthy();
  });
});
