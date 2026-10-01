import React, { act } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IncomingTeamInvite, TeamSummary } from '@/lib/api';

import { click, findAll, FakeElement, type FakeNode } from '../../fixtures/fakeDom';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';

const server = vi.hoisted(() => ({
  acceptIncomingTeamInvite: vi.fn(),
  getIncomingTeamInvites: vi.fn(),
  getTeams: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    ...server,
    getTeamActivity: vi.fn().mockResolvedValue([]),
    getTeamInvites: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: 'user-1' } }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { useWorkspace, WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { safeLocalStorage } from '@/lib/browserStorage';

const STORED_CONTEXT_KEY = 'serplists.activeWorkspaceId';

const joinedOrganization: TeamSummary = {
  id: 'team-joined',
  memberId: 'member-joined',
  membershipStatus: 'active',
  name: 'Joined Org',
  role: 'editor',
};

const invite: IncomingTeamInvite = {
  id: 'invite-1',
  teamId: joinedOrganization.id,
  teamName: joinedOrganization.name,
  email: 'invitee@example.com',
  role: 'editor',
  expiresAt: '2099-01-01T00:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
};

const fakeDom = aFakeDomForEachTest();

beforeEach(() => {
  safeLocalStorage.removeItem(STORED_CONTEXT_KEY);
  server.getTeams.mockReset().mockResolvedValue([]);
  server.getIncomingTeamInvites.mockReset().mockResolvedValue([invite]);
  server.acceptIncomingTeamInvite.mockReset().mockImplementation(async () => {
    server.getTeams.mockResolvedValue([joinedOrganization]);
    server.getIncomingTeamInvites.mockResolvedValue([]);
    return { memberId: joinedOrganization.memberId, role: 'editor', team: joinedOrganization, teamId: joinedOrganization.id };
  });
});

afterEach(() => {
  safeLocalStorage.removeItem(STORED_CONTEXT_KEY);
});

const isAcceptButtonFor = (teamName: string) => (node: FakeNode) =>
  node instanceof FakeElement && node.getAttribute('aria-label') === `Accept invite to ${teamName}`;

async function openSettingsInPersonal() {
  const shown: { activeWorkspaceId?: string } = {};
  const ActiveContext = () => {
    shown.activeWorkspaceId = useWorkspace().activeWorkspaceId;
    return null;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = await fakeDom.render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <ActiveContext />
        <TeamSettingsSection />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
  await letQueryUpdatesReachObservers();
  return { container, shown };
}

describe('accepting an incoming invite on the settings page', () => {
  it('selects the joined Organization, and the context stores it for the next visit', async () => {
    const { container, shown } = await openSettingsInPersonal();
    expect(shown.activeWorkspaceId).toBe('personal');

    const [acceptButton] = findAll(container, isAcceptButtonFor(joinedOrganization.name));
    assert.exists(acceptButton);
    await act(async () => {
      click(container, acceptButton);
    });
    await letQueryUpdatesReachObservers();

    expect(server.acceptIncomingTeamInvite).toHaveBeenCalledWith(invite.id);
    expect(shown.activeWorkspaceId).toBe(joinedOrganization.id);
    expect(safeLocalStorage.getItem(STORED_CONTEXT_KEY)).toBe(joinedOrganization.id);
  });
});
