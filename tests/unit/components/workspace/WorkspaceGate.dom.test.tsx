import { act } from 'react';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceGate } from '@/components/workspace/WorkspaceGate';

import { renderSettled } from '../../../support/renderInTheDom';

const workspace = vi.hoisted(() => ({ retryWorkspace: vi.fn(), selectWorkspace: vi.fn() }));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({ ...workspace, workspaceStatus: 'error' }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

describe('the Organization page when the Organizations failed to load', () => {
  it('retries loading them, or continues in Personal', async () => {
    await renderSettled(
      <WorkspaceGate>
        <p>Organization Templates</p>
      </WorkspaceGate>,
    );

    await press('Retry');
    await press('Continue in Personal');

    expect(workspace.retryWorkspace).toHaveBeenCalledTimes(1);
    expect(workspace.selectWorkspace).toHaveBeenCalledWith('personal');
    expect(screen.queryByText('Organization Templates')).toBeNull();
  });
});
