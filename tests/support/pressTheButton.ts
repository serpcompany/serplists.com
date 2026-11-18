import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';

export const pressTheButton = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
