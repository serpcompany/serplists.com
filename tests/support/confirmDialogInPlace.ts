import { act } from 'react';
import { expect, vi } from 'vitest';

import { click, findAll, findAllByRole, findByText, type FakeElement, type FakeNode } from '../fixtures/fakeDom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/ui/alert-dialog', async () => (await import('./overlaysInPlace')).alertDialogInPlace);

export const openDialogs = (container: FakeNode) => findAllByRole(container, 'dialog');

export async function openTheDialog(container: FakeElement, openLabel: string): Promise<FakeNode> {
  await act(async () => {
    click(container, findByText(container, 'BUTTON', openLabel));
  });
  const [dialog] = openDialogs(container);
  if (!dialog) throw new Error(`${openLabel} opened no dialog`);
  return dialog;
}

export async function clickInTheDialog(container: FakeElement, dialog: FakeNode, label: string) {
  await act(async () => {
    click(container, findByText(dialog, 'BUTTON', label));
  });
}

export async function openAndConfirm(container: FakeElement, openLabel: string, confirmLabel = openLabel) {
  await clickInTheDialog(container, await openTheDialog(container, openLabel), confirmLabel);
}

export const titleAndDescriptionOf = (dialog: FakeNode) => ({
  title: findAll(dialog, (node) => node.nodeName === 'H2')[0]?.textContent,
  description: findAll(dialog, (node) => node.nodeName === 'P')[0]?.textContent,
});

export async function openTheDeleteDialogWithNoneOpenBefore(container: FakeElement) {
  expect(openDialogs(container)).toHaveLength(0);
  const dialog = await openTheDialog(container, 'Delete');
  return { dialog, ...titleAndDescriptionOf(dialog) };
}
