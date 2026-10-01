import { vi } from 'vitest';

import { inThePersonalWorkspace } from '../fixtures/workspaces';

export const personalWorkspaceState = {
  status: 'ready' as 'ready' | 'loading' | 'error',
  teamsUnavailable: false,
};

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () =>
    inThePersonalWorkspace({
      isWorkspaceLoading: personalWorkspaceState.status !== 'ready',
      retryWorkspace: vi.fn(),
      teamsUnavailable: personalWorkspaceState.teamsUnavailable,
      workspaceStatus: personalWorkspaceState.status,
    }),
}));
