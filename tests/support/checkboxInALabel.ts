import { act } from 'react';
import { fireEvent } from '@testing-library/react';

export async function clickTheCheckboxInItsLabel(checkbox: HTMLElement) {
  let clicks = 0;
  const dropTheLabelsRepeatedClick = (event: Event) => {
    clicks += 1;
    if (clicks > 1) event.stopPropagation();
  };
  checkbox.addEventListener('click', dropTheLabelsRepeatedClick);
  try {
    await act(async () => {
      fireEvent.click(checkbox);
    });
  } finally {
    checkbox.removeEventListener('click', dropTheLabelsRepeatedClick);
  }
}
