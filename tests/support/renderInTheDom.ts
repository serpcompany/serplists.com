import { act, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within, type RenderResult } from '@testing-library/react';
import { afterAll, beforeAll } from 'vitest';

import { navigation } from './nextNavigation';

export const renderSettled = (
  ui: ReactNode,
  whileRendering: () => Promise<unknown> = async () => undefined,
): Promise<RenderResult> =>
  act(async () => {
    const rendered = render(ui);
    await whileRendering();
    return rendered;
  });

export function theInMemoryBrowserAsTheWindow(extraWindowProperties?: object) {
  let restoreWindow: () => void = () => {};
  beforeAll(() => {
    restoreWindow = navigation.installWindow(extraWindowProperties);
  });
  afterAll(() => restoreWindow());
}

export const theButtonOrMenuItemNamed = (name: string): HTMLElement => {
  const [control] = [...screen.queryAllByRole('button', { name }), ...screen.queryAllByRole('menuitem', { name })];
  if (!control) throw new Error(`No button or menu item named ${name}`);
  return control;
};

export async function openTheMenu(triggerLabel: string): Promise<HTMLElement[]> {
  await waitFor(() => {
    if (screen.queryAllByRole('menu').length > 0) throw new Error('A menu is still closing');
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: triggerLabel }));
  });
  return waitFor(() => {
    const items = screen.queryAllByRole('menuitem');
    if (items.length === 0) throw new Error(`${triggerLabel} opened no menu`);
    return items;
  });
}

export const typeInto = (field: HTMLElement, value: string) =>
  act(async () => {
    fireEvent.change(field, { target: { value } });
  });

export function inputNamed(name: string, scope: HTMLElement = document.body): HTMLInputElement {
  const field = within(scope).getByLabelText(name, { selector: 'input' });
  if (!(field instanceof HTMLInputElement)) throw new Error(`The field ${name} is not an input`);
  return field;
}

export async function onTheInMemoryBrowser<T>(run: () => Promise<T>): Promise<T> {
  const restoreWindow = navigation.installWindow();
  try {
    return await run();
  } finally {
    cleanup();
    restoreWindow();
  }
}
