import { act } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { theButtonOrMenuItemNamed } from './renderInTheDom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/alert-dialog', async () => (await import('./overlaysInPlace')).alertDialogInPlace);

export const openDialogs = () => screen.queryAllByRole('dialog');

async function openTheDialog(openLabel: string): Promise<HTMLElement> {
  await act(async () => {
    fireEvent.click(theButtonOrMenuItemNamed(openLabel));
  });
  const [dialog] = openDialogs();
  if (!dialog) throw new Error(`${openLabel} opened no dialog`);
  return dialog;
}

export async function clickInTheDialog(dialog: HTMLElement, label: string) {
  await act(async () => {
    fireEvent.click(within(dialog).getByRole('button', { name: label }));
  });
}

export async function openAndConfirm(openLabel: string, confirmLabel = openLabel) {
  await clickInTheDialog(await openTheDialog(openLabel), confirmLabel);
}

const titleAndDescriptionOf = (dialog: HTMLElement) => ({
  title: within(dialog).queryByRole('heading')?.textContent,
  description: within(dialog).queryAllByRole('paragraph')[0]?.textContent,
});

export async function openTheDeleteDialogWithNoneOpenBefore() {
  expect(openDialogs()).toHaveLength(0);
  const dialog = await openTheDialog('Delete');
  return { dialog, ...titleAndDescriptionOf(dialog) };
}
