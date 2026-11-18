import { clickTheButton, renderTheTemplateEditorPanels, thePanelHeading } from '../../../support/templateEditorPanels';
import { act } from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { buildTemplateEditorFormValues, type TemplateEditorFormSource } from '@/lib/forms/templateEditorForm';

import { inputNamed, typeInto } from '../../../support/renderInTheDom';

afterEach(cleanup);

const onboarding: TemplateEditorFormSource = {
  title: 'Onboarding',
  sections: [
    {
      id: 'section-1',
      title: 'Before day one',
      items: [{ id: 'task-1', title: 'Send the laptop', description: 'Ship it a week early', contents: [] }],
    },
  ],
};

const twoOfEach: TemplateEditorFormSource = {
  title: 'Onboarding',
  sections: [
    {
      id: 'section-1',
      title: 'Before day one',
      items: [
        { id: 'task-1', title: 'Send the laptop', contents: [] },
        { id: 'task-2', title: 'Collect the badge', contents: [] },
      ],
    },
    { id: 'section-2', title: 'First week', items: [] },
  ],
};

describe('the template editor panel beside the outline', () => {
  it('opens on Template Settings and switches to Search & SEO from the outline', async () => {
    await renderTheTemplateEditorPanels(onboarding);

    expect(thePanelHeading()).toBe('Template Settings');
    expect(inputNamed('Template Name').value).toBe('Onboarding');

    await clickTheButton('Search & SEO');

    expect(thePanelHeading()).toBe('Search & SEO');
    expect(screen.getByText('Configure how this template appears in search results and public listings.')).toBeTruthy();
  });

  it('shows a section and edits its title when the section is picked', async () => {
    const editor = await renderTheTemplateEditorPanels(onboarding);

    await clickTheButton('Before day one');

    expect(thePanelHeading()).toBe('Section Settings');
    await typeInto(inputNamed('Section Title'), 'Week one');
    expect(editor.values().sections[0]?.title).toBe('Week one');
  });

  it('shows the picked task and writes its title and description into the form', async () => {
    const editor = await renderTheTemplateEditorPanels(onboarding);

    await clickTheButton('Send the laptop');

    expect(thePanelHeading()).toBe('Task Details');
    expect(inputNamed('Task Title').value).toBe('Send the laptop');
    const description = screen.getByLabelText('Description (Optional)');
    expect(description.textContent).toBe('Ship it a week early');

    await typeInto(inputNamed('Task Title'), 'Ship the laptop');
    await typeInto(description, 'Two weeks early');

    expect(editor.values().sections[0]?.items[0]).toEqual(
      expect.objectContaining({ title: 'Ship the laptop', description: 'Two weeks early' }),
    );
    expect(editor.form().getFieldState('sections.0.items.0.title').isDirty).toBe(true);
  });

  it('asks for a task to be picked when a reload drops the selected task', async () => {
    const editor = await renderTheTemplateEditorPanels(twoOfEach);

    await clickTheButton('Collect the badge');
    await act(async () => {
      editor.form().reset(buildTemplateEditorFormValues(onboarding));
    });

    expect(thePanelHeading()).toBe('Task Details');
    expect(screen.getByText('Select a task from the outline to edit its instructions and attached content.')).toBeTruthy();
  });

  it('asks for a section when a reload drops the selected section', async () => {
    const editor = await renderTheTemplateEditorPanels(twoOfEach);

    await clickTheButton('First week');
    await act(async () => {
      editor.form().reset(buildTemplateEditorFormValues(onboarding));
    });

    expect(thePanelHeading()).toBe('Section Settings');
    expect(screen.getByText('Add a section from the outline to start building this template.')).toBeTruthy();
  });
});
