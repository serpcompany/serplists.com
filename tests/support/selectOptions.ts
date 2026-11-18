import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';

export async function chooseTheOption(comboboxName: string, optionName: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('combobox', { name: comboboxName }));
  });
  const option = await screen.findByRole('option', { name: optionName });
  await act(async () => {
    fireEvent.pointerDown(option, { pointerType: 'mouse' });
    fireEvent.click(option);
  });
  await waitFor(() => {
    expect(screen.queryAllByRole('listbox')).toHaveLength(0);
  });
}
