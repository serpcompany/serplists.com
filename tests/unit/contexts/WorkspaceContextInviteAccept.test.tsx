import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';

import { createFakeContainer } from '../../fixtures/fakeDom';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';

const apiMocks = vi.hoisted(() => ({ createTeam: vi.fn(), getTeams: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: 'user-1' } }),
}));

import { useWorkspace, WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';
import { safeLocalStorage } from '@/lib/browserStorage';

const STORAGE_KEY = 'serplists.activeWorkspaceId';

const team = (id: string, name: string): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name,
  role: 'editor',
});
const joined = team('team-x', 'Joined Org');
const stored = team('team-y', 'Stored Org');

beforeEach(() => {
  apiMocks.getTeams.mockReset();
  safeLocalStorage.setItem(STORAGE_KEY, stored.id);
});

afterEach(() => {
  safeLocalStorage.removeItem(STORAGE_KEY);
});

const fakeDom = aFakeDomForEachTest();

async function mountWorkspace() {
  let value: ReturnType<typeof useWorkspace> | undefined;
  const Probe = () => {
    value = useWorkspace();
    return null;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = fakeDom.track(createRoot(createFakeContainer() as unknown as Element));
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </QueryClientProvider>,
    ),
  );
  await letQueryUpdatesReachObservers();
  return {
    queryClient,
    workspace: () => {
      if (!value) throw new Error('WorkspaceProvider did not render');
      return value;
    },
  };
}

const acceptInvite = async (workspace: ReturnType<typeof useWorkspace>) => {
  await act(async () => {
    await acceptTeamInviteForWorkspace('invite-token', {
      acceptTeamInvite: async () => ({ memberId: joined.memberId, role: 'editor', team: joined, teamId: joined.id }),
      refreshTeams: workspace.refreshTeams,
      rememberTeam: workspace.rememberTeam,
    });
  });
  await letQueryUpdatesReachObservers();
};

describe('accepting an invite link after the teams request failed, when only a settled server list may rule out the stored Organization', () => {
  const acceptWhileTheTeamsRequestKeepsFailing = async () => {
    apiMocks.getTeams.mockRejectedValue(new Error('Teams unavailable'));
    const tab = await mountWorkspace();
    expect(tab.workspace().workspaceStatus).toBe('error');
    await acceptInvite(tab.workspace());
    return tab;
  };

  it('keeps the stored Organization unconfirmed, not Personal, and caches no list the server never sent, when the refresh fails too', async () => {
    const { queryClient, workspace } = await acceptWhileTheTeamsRequestKeepsFailing();

    expect(workspace().workspaceStatus).toBe('error');
    expect(workspace().teams.map(({ id }) => id)).toEqual([joined.id]);
    expect(queryClient.getQueryData(['teams', 'user-1'])).toBeUndefined();
  });

  it('opens the stored Organization once the teams request works again', async () => {
    const { workspace } = await acceptWhileTheTeamsRequestKeepsFailing();

    apiMocks.getTeams.mockResolvedValue([joined, stored]);
    act(() => workspace().retryWorkspace());
    await letQueryUpdatesReachObservers();

    expect(workspace().workspaceStatus).toBe('ready');
    expect(workspace().activeWorkspaceId).toBe(stored.id);
  });

  it('keeps the stored Organization when the refresh lists it', async () => {
    apiMocks.getTeams.mockRejectedValueOnce(new Error('Teams unavailable'));
    const { workspace } = await mountWorkspace();
    apiMocks.getTeams.mockResolvedValue([joined, stored]);

    await acceptInvite(workspace());

    expect(workspace().workspaceStatus).toBe('ready');
    expect(workspace().activeWorkspaceId).toBe(stored.id);
  });
});
