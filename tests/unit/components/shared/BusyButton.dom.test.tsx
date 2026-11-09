import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BusyButton } from '@/components/shared/BusyButton';

import { renderSettled } from '../../../support/renderInTheDom';

afterEach(cleanup);

describe('a button that shows when its work is running', () => {
  it('shows its label and can be pressed while idle', async () => {
    await renderSettled(
      <BusyButton busy={false} busyLabel="Sending link...">
        Send reset link
      </BusyButton>,
    );

    expect(screen.getByRole('button', { name: 'Send reset link' })).toHaveProperty('disabled', false);
  });

  it('shows the busy label and cannot be pressed again while busy', async () => {
    await renderSettled(
      <BusyButton busy busyLabel="Sending link...">
        Send reset link
      </BusyButton>,
    );

    expect(screen.getByRole('button', { name: 'Sending link...' })).toHaveProperty('disabled', true);
  });

  it('lets its caller decide when it is disabled', async () => {
    await renderSettled(
      <BusyButton busy busyLabel="Signing in..." disabled={false}>
        Sign in
      </BusyButton>,
    );

    expect(screen.getByRole('button', { name: 'Signing in...' })).toHaveProperty('disabled', false);
  });
});
