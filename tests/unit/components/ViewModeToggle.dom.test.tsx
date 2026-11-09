import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewModeToggle } from '@/components/layout/ViewModeToggle';

import { renderSettled } from '../../support/renderInTheDom';

describe('the grid and list toggle of a Template list', () => {
  it('marks the current view pressed and switches the view on a tap', async () => {
    const onChange = vi.fn();
    await renderSettled(<ViewModeToggle onChange={onChange} value="grid" />);

    expect(screen.getByRole('button', { name: 'Show templates in grid view' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Show templates in list view' }).getAttribute('aria-pressed')).toBe('false');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show templates in list view' }));
      fireEvent.click(screen.getByRole('button', { name: 'Show templates in grid view' }));
    });

    expect(onChange.mock.calls).toEqual([['list'], ['grid']]);
  });
});
