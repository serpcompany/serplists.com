import { clickTheButton, renderTheTemplateEditorPanels } from '../../../support/templateEditorPanels';
import React, { act } from 'react';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';

import { TemplateBasicInfo } from '@/components/template-editor/TemplateBasicInfo';
import type { TemplateEditorDetailsFormValues } from '@/lib/forms/templateEditorDetailsForm';

import { inputNamed, renderSettled, typeInto } from '../../../support/renderInTheDom';
import { chooseTheOption } from '../../../support/selectOptions';

afterEach(cleanup);

const pressEnter = (field: HTMLElement) =>
  act(async () => {
    fireEvent.keyDown(field, { key: 'Enter' });
  });

describe('the Template Settings panel', () => {
  it('writes the name and goal into the form', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house' });

    await typeInto(inputNamed('Template Name'), 'Move flat');
    await typeInto(screen.getByLabelText('Goal / Summary'), 'Everything for moving day');

    expect(editor.values()).toEqual(expect.objectContaining({ title: 'Move flat', description: 'Everything for moving day' }));
    expect(editor.form().getFieldState('title').isDirty).toBe(true);
  });

  it('adds a trimmed tag with Enter or the Add button, ignores a blank one, and removes one', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house', tags: ['home'] });

    await typeInto(inputNamed('Tags'), '  boxes  ');
    await pressEnter(inputNamed('Tags'));
    expect(inputNamed('Tags').value).toBe('');
    await typeInto(inputNamed('Tags'), 'van');
    await clickTheButton('Add');
    await typeInto(inputNamed('Tags'), '   ');
    await clickTheButton('Add');
    await pressEnter(inputNamed('Tags'));

    expect(editor.values().tags).toEqual(['home', 'boxes', 'van']);

    await clickTheButton('Remove tag home');

    expect(editor.values().tags).toEqual(['boxes', 'van']);
    expect(screen.queryByRole('button', { name: 'Remove tag home' })).toBeNull();
  });

  it('leaves a tag being typed alone on other keys', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house' });

    await typeInto(inputNamed('Tags'), 'van');
    await act(async () => {
      fireEvent.keyDown(inputNamed('Tags'), { key: 'Tab' });
    });

    expect(inputNamed('Tags').value).toBe('van');
    expect(editor.values().tags).toEqual([]);
  });

  it('switches the Template type to Recipe', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Bread' });

    await chooseTheOption('Template Type', 'Recipe');

    await waitFor(() => {
      expect(editor.values().templateType).toBe('recipe');
    });
  });

  it('picks and unpicks categories, naming a stored category that is not in the list by its value', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house', categories: ['relocation'] });

    expect(screen.getByRole('button', { name: 'Remove relocation' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Categories' }).textContent).toContain('1 selected');

    await act(async () => {
      fireEvent.click(screen.getByRole('combobox', { name: 'Categories' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'moving' }));
    });
    await waitFor(() => {
      expect(editor.values().categories).toEqual(['relocation', 'moving']);
    });
    const moving = await screen.findByRole('option', { name: 'moving' });
    await act(async () => {
      fireEvent.click(moving);
    });
    await waitFor(() => {
      expect(editor.values().categories).toEqual(['relocation']);
    });

    await clickTheButton('Remove relocation');

    expect(editor.values().categories).toEqual([]);
    expect(screen.getByRole('combobox', { name: 'Categories' }).textContent).toContain('Select categories...');
  });

  it('makes the Template private with the Public Template switch', async () => {
    const editor = await renderTheTemplateEditorPanels({ title: 'Move house', isPublic: true });

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Public Template' }));
    });

    expect(editor.values().isPublic).toBe(false);
  });
});

describe('the Template Settings panel on a form that holds no tags or categories yet', () => {
  it('shows no tags and no chosen category, then adds the first tag', async () => {
    const held: { tags: () => string[] | undefined } = { tags: () => undefined };
    function Settings() {
      const form = useForm<TemplateEditorDetailsFormValues>({ defaultValues: { title: 'Bread' } });
      held.tags = () => form.getValues('tags');
      return (
        <FormProvider {...form}>
          <TemplateBasicInfo />
        </FormProvider>
      );
    }
    await renderSettled(<Settings />);

    expect(screen.queryByRole('button', { name: /^Remove tag / })).toBeNull();
    expect(held.tags()).toBeUndefined();
    await typeInto(inputNamed('Tags'), 'rye');
    await pressEnter(inputNamed('Tags'));

    expect(held.tags()).toEqual(['rye']);
    expect(screen.getByRole('button', { name: 'Remove tag rye' })).toBeTruthy();
  });
});
