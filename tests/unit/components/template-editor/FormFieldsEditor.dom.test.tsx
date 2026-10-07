import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm, type UseFormReturn } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';

import { ContentEditor } from '@/components/template-editor/ContentEditor';
import {
  buildTemplateEditorFormValues,
  type TemplateEditorFormField,
  type TemplateEditorFormValues,
} from '@/lib/forms/templateEditorForm';
import { inputNamed, renderSettled, typeInto } from '../../../support/renderInTheDom';

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}));

const field = (overrides: Partial<TemplateEditorFormField> & Pick<TemplateEditorFormField, 'id' | 'label'>): TemplateEditorFormField => ({
  kind: 'text',
  required: false,
  ...overrides,
});

async function mountTheEditor(contents: unknown[] = []) {
  const form: { current?: UseFormReturn<TemplateEditorFormValues> } = {};
  function Harness() {
    const methods = useForm<TemplateEditorFormValues>({
      defaultValues: buildTemplateEditorFormValues({
        sections: [{ id: 'section-1', title: 'Intake', items: [{ id: 'task-1', title: 'Collect details', contents }] }],
      }),
    });
    form.current = methods;
    return (
      <FormProvider {...methods}>
        <ContentEditor itemIndex={0} sectionIndex={0} />
      </FormProvider>
    );
  }
  await renderSettled(<Harness />);
  const fields = (): TemplateEditorFormField[] => {
    if (!form.current) throw new Error('The editor form did not mount');
    return form.current.getValues('sections.0.items.0.contents.0.fields') ?? [];
  };
  const press = (name: string) => act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
  return { fields, press };
}

async function chooseType(fieldNumber: number, typeLabel: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('combobox', { name: `Field ${fieldNumber} Type` }));
  });
  const option = await screen.findByRole('option', { name: typeLabel });
  await act(async () => {
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.click(option);
  });
  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: `Field ${fieldNumber} Type` }).textContent).toContain(typeLabel);
  });
}

describe('the Form block in the Template editor', () => {
  it('adds a Form from Add Block, starting with one short text field that is not required', async () => {
    const editor = await mountTheEditor();

    const [addBlock] = screen.getAllByRole('button', { name: 'Add Block' });
    if (!addBlock) throw new Error('No Add Block button');
    await act(async () => {
      fireEvent.click(addBlock);
    });
    const formItem = await screen.findByRole('menuitem', { name: 'Form' });
    await act(async () => {
      fireEvent.click(formItem);
    });

    expect(screen.getByText('Form fields')).toBeTruthy();
    expect(editor.fields()).toEqual([expect.objectContaining({ kind: 'text', label: '', required: false })]);
    expect(editor.fields()[0]?.id).toMatch(/^field_/);
    expect(screen.getByRole('button', { name: 'Remove field 1' }).hasAttribute('disabled')).toBe(true);
  });

  it('names a field, gives it help text, makes it required, and adds a second one', async () => {
    const editor = await mountTheEditor([{ id: 'form-1', type: 'form', value: '', fields: [field({ id: 'field_a', label: '' })] }]);

    await typeInto(inputNamed('Field 1 Label'), 'Client name');
    await typeInto(screen.getByRole('textbox', { name: 'Field 1 Help text' }), 'As on the contract');
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Field 1 Required' }));
    });
    await editor.press('Add field');

    expect(editor.fields()).toEqual([
      expect.objectContaining({ id: 'field_a', label: 'Client name', description: 'As on the contract', required: true }),
      expect.objectContaining({ kind: 'text', label: '' }),
    ]);
    expect(inputNamed('Field 2 Label')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove field 1' }).hasAttribute('disabled')).toBe(false);
  });

  it('moves a field up and down and removes one, keeping each field id', async () => {
    const editor = await mountTheEditor([{
      id: 'form-1',
      type: 'form',
      value: '',
      fields: [field({ id: 'field_a', label: 'First' }), field({ id: 'field_b', label: 'Second' }), field({ id: 'field_c', label: 'Third' })],
    }]);

    await editor.press('Move field 3 up');
    expect(editor.fields().map(({ id }) => id)).toEqual(['field_a', 'field_c', 'field_b']);
    expect(screen.getAllByRole('status').map((status) => status.textContent)).toContain('Moved field 3 to position 2 of 3');

    await editor.press('Move field 1 down');
    expect(editor.fields().map(({ id }) => id)).toEqual(['field_c', 'field_a', 'field_b']);
    expect(screen.getByRole('button', { name: 'Move field 1 up' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Move field 3 down' }).hasAttribute('disabled')).toBe(true);

    await editor.press('Remove field 2');
    expect(editor.fields().map(({ id }) => id)).toEqual(['field_c', 'field_b']);
    expect(inputNamed('Field 2 Label').value).toBe('Second');
  });

  it('gives a dropdown an options list to add, rename and remove options, and drops the options when it becomes short text again', async () => {
    const editor = await mountTheEditor([{ id: 'form-1', type: 'form', value: '', fields: [field({ id: 'field_a', label: 'Plan' })] }]);

    await chooseType(1, 'Dropdown');
    expect(editor.fields()[0]).toMatchObject({ kind: 'select', options: [expect.objectContaining({ label: '' })] });
    expect(screen.getByRole('button', { name: 'Remove field 1 option 1' }).hasAttribute('disabled')).toBe(true);

    await typeInto(inputNamed('Field 1 option 1'), 'Free');
    await editor.press('Add option');
    await typeInto(inputNamed('Field 1 option 2'), 'Pro');
    await editor.press('Add option');
    await editor.press('Remove field 1 option 2');

    expect(editor.fields()[0]?.options?.map(({ label }) => label)).toEqual(['Free', '']);
    expect(editor.fields()[0]?.options?.every(({ id }) => id.startsWith('option_'))).toBe(true);

    await chooseType(1, 'Multiple choice');
    expect(editor.fields()[0]?.options?.map(({ label }) => label)).toEqual(['Free', '']);

    await chooseType(1, 'Short text');
    expect(editor.fields()[0]).toMatchObject({ kind: 'text', options: undefined });
    expect(screen.queryByText('Options')).toBeNull();
  });

  it('offers a minimum and a maximum for a number, and clears them for another type', async () => {
    const editor = await mountTheEditor([{ id: 'form-1', type: 'form', value: '', fields: [field({ id: 'field_a', label: 'Seats' })] }]);

    await chooseType(1, 'Number');
    await typeInto(inputNamed('Field 1 Minimum'), '1');
    await typeInto(inputNamed('Field 1 Maximum'), '12.5');
    expect(editor.fields()[0]).toMatchObject({ kind: 'number', min: 1, max: 12.5 });

    await typeInto(inputNamed('Field 1 Maximum'), '');
    expect(editor.fields()[0]?.max).toBeUndefined();

    await chooseType(1, 'Date');
    expect(editor.fields()[0]).toMatchObject({ kind: 'date', min: undefined, max: undefined });
    expect(screen.queryByLabelText('Field 1 Minimum')).toBeNull();
  });
});
