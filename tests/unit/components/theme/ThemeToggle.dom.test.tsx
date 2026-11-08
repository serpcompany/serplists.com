import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeToggle } from '@/components/theme/ThemeToggle';

import { renderSettled } from '../../../support/renderInTheDom';

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove('dark');
  document.body.classList.remove('dark');
});

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

describe('the theme toggle', () => {
  it('switches the page to dark mode and back, naming the mode it switches to', async () => {
    await renderSettled(<ThemeToggle showLabel />);

    expect(screen.getByText('Light mode')).toBeTruthy();
    await press('Switch to dark mode');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByText('Dark mode')).toBeTruthy();

    await press('Switch to light mode');

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeTruthy();
  });
});
