import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import { RequiredToolsEditor } from '@/components/template-editor/RequiredToolsEditor';
import { buildTemplateEditorFormValues, type TemplateEditorFormValues } from '@/lib/forms/templateEditorForm';
import { REQUIRED_TOOLS_MAX } from '@/lib/schemas/requiredTools';
import { inputNamed, renderSettled, typeInto } from '../../../support/renderInTheDom';

const TIMER = { name: 'Time tracker', url: 'https://example.com/track', required: true };

async function mountTheEditor(requiredTools: TemplateEditorFormValues['requiredTools'] = []) {
  const form: { current?: UseFormReturn<TemplateEditorFormValues> } = {};
  function Harness() {
    const methods = useForm<TemplateEditorFormValues>({ defaultValues: buildTemplateEditorFormValues({ requiredTools }) });
    form.current = methods;
    return (
      <FormProvider {...methods}>
        <RequiredToolsEditor />
        <output aria-label="Unsaved changes">{methods.formState.isDirty ? 'yes' : 'no'}</output>
      </FormProvider>
    );
  }
  await renderSettled(<Harness />);
  const values = () => {
    if (!form.current) throw new Error('The editor form did not mount');
    return form.current.getValues();
  };
  const press = (name: string) => act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  return { press, values, unsavedChanges: () => screen.getByRole('status', { name: 'Unsaved changes' }).textContent };
}

describe('Required tools in the Template editor\'s Template Settings', () => {
  it('adds a tool, names it and links it, required unless switched off, and marks the form as changed', async () => {
    const editor = await mountTheEditor();

    await editor.press('Add tool');
    await typeInto(inputNamed('Tool 1 Name'), 'Slideshow app');
    await typeInto(inputNamed('Tool 1 URL'), 'https://example.com/slides');
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Tool 1 Required' }));
    });

    expect(editor.values().requiredTools).toEqual([{ name: 'Slideshow app', url: 'https://example.com/slides', required: false }]);
    expect(editor.unsavedChanges()).toBe('yes');
  });

  it('shows the stored tools, and removes the one whose button is pressed', async () => {
    const editor = await mountTheEditor([TIMER, { name: 'Deck', url: 'https://example.com/deck', required: false }]);

    expect(inputNamed('Tool 1 Name').value).toBe('Time tracker');
    expect(inputNamed('Tool 2 URL').value).toBe('https://example.com/deck');
    await editor.press('Remove tool 1');

    expect(editor.values().requiredTools).toEqual([{ name: 'Deck', url: 'https://example.com/deck', required: false }]);
    expect(inputNamed('Tool 1 Name').value).toBe('Deck');
  });

  it(`stops adding at ${REQUIRED_TOOLS_MAX} tools and says why`, async () => {
    await mountTheEditor(Array.from({ length: REQUIRED_TOOLS_MAX }, () => TIMER));

    expect(screen.getByRole('button', { name: 'Add tool' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(`A template can list up to ${REQUIRED_TOOLS_MAX} tools.`)).toBeDefined();
  });

  it('names every field after its tool, so no two share a name', async () => {
    await mountTheEditor([TIMER, TIMER]);

    for (const name of ['Tool 1 Name', 'Tool 2 Name', 'Tool 1 URL', 'Tool 2 URL']) expect(inputNamed(name)).toBeDefined();
    expect(screen.getAllByRole('switch').map((control) => control.getAttribute('aria-checked'))).toEqual(['true', 'true']);
    expect(screen.getByRole('button', { name: 'Remove tool 2' })).toBeDefined();
  });
});
