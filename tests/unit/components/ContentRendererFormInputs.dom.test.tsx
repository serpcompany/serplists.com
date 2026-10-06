import '../../support/mockedNextNavigation';
import React from 'react';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ContentRenderer } from '@/components/shared/ContentRenderer';
import type { ChecklistFormField, FormAnswer } from '@/types/checklist';

import { renderSettled, theInMemoryBrowserAsTheWindow, typeInto } from '../../support/renderInTheDom';

const upload = vi.hoisted(() => ({ uploadSelectedFile: vi.fn() }));
vi.mock('@/components/ui/file-upload-flow', () => upload);

theInMemoryBrowserAsTheWindow();

type AnswerChange = (contentIndex: number, fieldId: string, answer: FormAnswer | undefined) => void;

const textField = (overrides: Partial<ChecklistFormField> = {}): ChecklistFormField => ({
  id: 'field-name',
  label: 'Client name',
  kind: 'text',
  required: true,
  ...overrides,
});

async function renderForm(fields: ChecklistFormField[], props: { formCheck?: number; uploadLoginPath?: string } = {}) {
  const onFormAnswerChange = vi.fn<AnswerChange>();
  const element = (formCheck = props.formCheck ?? 0, shownFields = fields) => (
    <ContentRenderer
      contents={[{ id: 'notes', type: 'text', value: 'Read the brief' }, { id: 'form-1', type: 'form', value: '', fields: shownFields }]}
      formCheck={formCheck}
      onFormAnswerChange={onFormAnswerChange}
      uploadLoginPath={props.uploadLoginPath}
    />
  );
  const rendered = await renderSettled(element());
  const rerenderWithCheck = (formCheck: number) => act(async () => {
    rendered.rerender(element(formCheck));
  });
  const rerenderWithFields = (savedFields: ChecklistFormField[]) => act(async () => {
    rendered.rerender(element(props.formCheck ?? 0, savedFields));
  });
  return { onFormAnswerChange, rerenderWithCheck, rerenderWithFields };
}

const blur = (field: HTMLElement) => act(async () => {
  fireEvent.blur(field);
});

const click = (control: HTMLElement) => act(async () => {
  fireEvent.click(control);
});

beforeEach(() => {
  upload.uploadSelectedFile.mockReset();
});

describe('a Form block on the Run page', () => {
  it('saves typed text when the field loses focus, not on every key, and says what a required field needs once it was left empty', async () => {
    const form = await renderForm([textField({ description: 'As on the contract' })]);
    const input = screen.getByRole('textbox', { name: 'Client name' });

    expect(input.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('As on the contract')).toBeTruthy();
    expect(screen.queryByText('Fill in this field.')).toBeNull();

    await blur(input);
    expect(screen.getByText('Fill in this field.')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    await typeInto(input, 'Acme');
    await typeInto(input, 'Acme Inc');
    expect(form.onFormAnswerChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Fill in this field.')).toBeNull();

    await blur(input);
    expect(form.onFormAnswerChange).toHaveBeenCalledTimes(1);
    expect(form.onFormAnswerChange).toHaveBeenCalledWith(1, 'field-name', 'Acme Inc');

    await form.rerenderWithFields([textField({ description: 'As on the contract', answer: 'Acme Inc' })]);
    await blur(input);
    expect(form.onFormAnswerChange).toHaveBeenCalledTimes(1);
  });

  it('sends a typed answer again after its save did not land, and the answer typed back after a save still on its way', async () => {
    const form = await renderForm([textField({ answer: 'Acme' })]);
    const input = screen.getByRole('textbox', { name: 'Client name' });

    await typeInto(input, 'Acme Inc');
    await blur(input);
    await blur(input);
    expect(form.onFormAnswerChange.mock.calls.map(([, , answer]) => answer)).toEqual(['Acme Inc', 'Acme Inc']);

    await typeInto(input, 'Acme');
    await blur(input);
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-name', 'Acme');
  });

  it('checks a URL, an email, a number and a date by their kind, and saves a number as a number', async () => {
    const form = await renderForm([
      textField({ id: 'field-site', label: 'Website', kind: 'url', required: false }),
      textField({ id: 'field-email', label: 'Contact email', kind: 'email', required: false }),
      textField({ id: 'field-seats', label: 'Seats', kind: 'number', required: false, min: 1, max: 10 }),
      textField({ id: 'field-due', label: 'Due', kind: 'date', required: false }),
    ]);

    const site = screen.getByRole('textbox', { name: 'Website' });
    await typeInto(site, 'example.com');
    await blur(site);
    expect(screen.getByText('Enter a URL that starts with http:// or https://.')).toBeTruthy();
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-site', 'example.com');

    const email = screen.getByRole('textbox', { name: 'Contact email' });
    await typeInto(email, 'sam@example.com');
    await blur(email);
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-email', 'sam@example.com');

    const seats = screen.getByRole('spinbutton', { name: 'Seats' });
    await typeInto(seats, '12');
    await blur(seats);
    expect(screen.getByText('Enter a number from 1 to 10.')).toBeTruthy();
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-seats', 12);

    const due = screen.getByLabelText('Due');
    await typeInto(due, '2026-10-06');
    await blur(due);
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-due', '2026-10-06');
  });

  it('saves a long text answer, and clearing a field saves no answer', async () => {
    const form = await renderForm([textField({ id: 'field-summary', label: 'Summary', kind: 'longText', required: false, answer: 'Draft' })]);
    const summary = screen.getByRole('textbox', { name: 'Summary' });

    if (!(summary instanceof HTMLTextAreaElement)) throw new Error('Summary is not a text area');
    expect(summary.value).toBe('Draft');
    await typeInto(summary, '   ');
    await blur(summary);

    expect(form.onFormAnswerChange).toHaveBeenCalledWith(1, 'field-summary', undefined);
  });

  it('saves a dropdown, multiple choice and checkbox answer as soon as it changes', async () => {
    const form = await renderForm([
      textField({ id: 'field-plan', label: 'Plan', kind: 'select', options: [{ id: 'free', label: 'Free' }, { id: 'pro', label: 'Pro' }] }),
      textField({
        id: 'field-channels',
        label: 'Channels',
        kind: 'multiSelect',
        required: false,
        options: [{ id: 'email', label: 'Email' }, { id: 'chat', label: 'Chat' }, { id: 'phone', label: 'Phone' }],
      }),
      textField({ id: 'field-terms', label: 'Terms accepted', kind: 'checkbox' }),
    ]);

    await click(screen.getByRole('combobox', { name: 'Plan' }));
    const pro = await screen.findByRole('option', { name: 'Pro' });
    await act(async () => {
      fireEvent.pointerDown(pro, { pointerType: 'mouse' });
      fireEvent.click(pro);
    });
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-plan', 'pro');
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Plan' }).textContent).toContain('Pro');
    });

    await click(screen.getByRole('checkbox', { name: 'Phone' }));
    await click(screen.getByRole('checkbox', { name: 'Email' }));
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-channels', ['email', 'phone']);
    await click(screen.getByRole('checkbox', { name: 'Email' }));
    await click(screen.getByRole('checkbox', { name: 'Phone' }));
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-channels', undefined);

    await click(screen.getByRole('checkbox', { name: 'Terms accepted' }));
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-terms', true);
    await click(screen.getByRole('checkbox', { name: 'Terms accepted' }));
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-terms', undefined);
    expect(screen.getByText('Check this box.')).toBeTruthy();
  });

  it('uploads a file for a signed-in user, shows its name, and removes it', async () => {
    upload.uploadSelectedFile.mockImplementation(async ({ onUploaded }: { onUploaded: (info: { url: string; fileName: string; fileSize: number }) => void }) => {
      onUploaded({ url: '/api/uploads/file?key=template-files/brief.pdf', fileName: 'brief.pdf', fileSize: 2048 });
      return true;
    });
    const form = await renderForm([textField({ id: 'field-brief', label: 'Brief', kind: 'file' })]);

    const button = screen.getByRole('button', { name: 'Brief Upload file' });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!fileInput) throw new Error('No file input');
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [new File(['brief'], 'brief.pdf', { type: 'application/pdf' })] } });
    });

    expect(button).toBeTruthy();
    expect(upload.uploadSelectedFile).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }));
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-brief', {
      url: '/api/uploads/file?key=template-files/brief.pdf',
      fileName: 'brief.pdf',
      fileSize: 2048,
    });
    expect(screen.getByRole('link', { name: 'brief.pdf' }).getAttribute('href')).toBe('/api/uploads/file?key=template-files/brief.pdf');

    await click(screen.getByRole('button', { name: 'Remove brief.pdf' }));
    expect(form.onFormAnswerChange).toHaveBeenLastCalledWith(1, 'field-brief', undefined);
  });

  it('asks a visitor who is not signed in to log in to upload, and comes back to the run after', async () => {
    await renderForm([textField({ id: 'field-brief', label: 'Brief', kind: 'file' })], { uploadLoginPath: '/login/?next=%2Fprofile%2Falice%2Fcamping%2Frun%2F' });

    const login = screen.getByRole('link', { name: 'Brief Log in to upload' });
    expect(login.getAttribute('href')).toBe('/login/?next=%2Fprofile%2Falice%2Fcamping%2Frun%2F');
    expect(screen.queryByRole('button', { name: /Upload file/ })).toBeNull();
  });

  it('shows every field that blocks the task and moves focus to the first one when completing was refused', async () => {
    const form = await renderForm([
      textField({ id: 'field-done', label: 'Done by', required: false }),
      textField({ id: 'field-name', label: 'Client name' }),
      textField({ id: 'field-site', label: 'Website', kind: 'url', required: true }),
    ]);
    expect(screen.queryByText('Fill in this field.')).toBeNull();

    await form.rerenderWithCheck(1);

    const formBlock = screen.getByRole('heading', { name: 'Form' }).closest('div.space-y-3');
    if (!(formBlock instanceof HTMLElement)) throw new Error('No form block');
    expect(within(formBlock).getByText('Fill in this field.')).toBeTruthy();
    expect(within(formBlock).getByText('Enter a URL.')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Client name' }));
    expect(form.onFormAnswerChange).not.toHaveBeenCalled();
  });

  it('shows the form read-only, with its answers, when the run cannot be changed', async () => {
    await renderSettled(
      <ContentRenderer
        contents={[{ id: 'form-1', type: 'form', value: '', fields: [textField({ answer: 'Acme' })] }]}
        disabled
        onFormAnswerChange={vi.fn<AnswerChange>()}
      />,
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Acme')).toBeTruthy();
  });
});
