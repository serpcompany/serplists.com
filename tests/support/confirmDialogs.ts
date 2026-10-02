import { act } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect } from 'vitest';

import { theButtonOrMenuItemNamed } from './renderInTheDom';

export const openDialogs = () => [...screen.queryAllByRole('alertdialog'), ...screen.queryAllByRole('dialog')];

async function openTheDialog(openLabel: string): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(theButtonOrMenuItemNamed(openLabel));
  });
  return waitFor(() => {
    const [dialog] = openDialogs();
    if (!dialog) throw new Error(`${openLabel} opened no dialog`);
    return dialog;
  });
}

export async function clickInTheDialog(dialog: HTMLElement, label: string) {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: label }));
  });
}

export async function openAndConfirm(openLabel: string, confirmLabel = openLabel) {
  await clickInTheDialog(await openTheDialog(openLabel), confirmLabel);
}

export const theDialogsToClose = () =>
  waitFor(() => {
    expect(openDialogs()).toHaveLength(0);
  });

const titleAndDescriptionOf = (dialog: HTMLElement) => ({
  title: within(dialog).queryByRole('heading')?.textContent,
  description: within(dialog).queryAllByRole('paragraph')[0]?.textContent,
});

export async function openTheDeleteDialogWithNoneOpenBefore() {
  expect(openDialogs()).toHaveLength(0);
  const dialog = await openTheDialog('Delete');
  return { dialog, ...titleAndDescriptionOf(dialog) };
}
