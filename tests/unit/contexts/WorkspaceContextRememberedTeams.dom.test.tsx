import '../../support/mockedNextNavigation';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';

import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { renderTheWorkspaceProvider, type ShownWorkspace } from '../../support/workspaceProviderProbe';

const { getTeams } = vi.hoisted(() => ({ getTeams: vi.fn() }));
const signedIn = vi.hoisted(() => ({ userId: 'user-1' }));

vi.mock('@/lib/api', () => ({ api: { getTeams } }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: signedIn.userId } }),
}));

const organization = (id: string): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name: `Organization ${id}`,
  role: 'owner',
});

beforeEach(() => {
  signedIn.userId = 'user-1';
  getTeams.mockReset();
  getTeams.mockRejectedValue(new Error('Teams unavailable'));
});

async function withWorkspace(
  test: (tab: { rerender: () => void; workspace: () => ShownWorkspace }) => Promise<void>,
) {
  const tab = renderTheWorkspaceProvider();
  await letQueryUpdatesReachObservers();
  try {
    await test(tab);
  } finally {
    tab.unmount();
  }
}

const teamIdsOf = (workspace: ShownWorkspace) => workspace.teams.map(({ id }) => id);

describe('Organizations remembered in this tab', () => {
  it('are shown until the next list the server sends, which replaces them', () =>
    withWorkspace(async ({ workspace }) => {
      act(() => workspace().rememberTeam(organization('created')));
      expect(teamIdsOf(workspace())).toEqual(['created']);

      getTeams.mockResolvedValue([organization('listed')]);
      act(() => workspace().retryWorkspace());
      await letQueryUpdatesReachObservers();

      expect(teamIdsOf(workspace())).toEqual(['listed']);
    }));

  it('are never shown to the next user who signs in on the tab', () =>
    withWorkspace(async ({ rerender, workspace }) => {
      act(() => workspace().rememberTeam(organization('created')));
      expect(teamIdsOf(workspace())).toEqual(['created']);

      signedIn.userId = 'user-2';
      rerender();
      await letQueryUpdatesReachObservers();

      expect(teamIdsOf(workspace())).toEqual([]);
    }));
});
