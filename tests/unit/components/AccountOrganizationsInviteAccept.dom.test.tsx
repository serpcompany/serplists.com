import '../../support/mockedNextNavigation';
import { teamSettingsServer as server } from '../../support/signedInTeamSettingsApi';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IncomingTeamInvite, TeamSummary } from '@/lib/api';

import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { renderSettled } from '../../support/renderInTheDom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import { AccountOrganizationsSection } from '@/components/account/AccountOrganizationsSection';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { WorkspaceProvider } from '@/contexts/WorkspaceProvider';
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

async function openSettingsInPersonal() {
  const shown: { activeWorkspaceId?: string } = {};
  const ActiveContext = () => {
    shown.activeWorkspaceId = useWorkspace().activeWorkspaceId;
    return null;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await renderSettled(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <ActiveContext />
        <AccountOrganizationsSection />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
  await letQueryUpdatesReachObservers();
  return { shown };
}

describe('accepting an incoming invite on the settings page', () => {
  it('selects the joined Organization, and the context stores it for the next visit', async () => {
    const { shown } = await openSettingsInPersonal();
    expect(shown.activeWorkspaceId).toBe('personal');

    const acceptButton = screen.getByRole('button', { name: `Accept invite to ${joinedOrganization.name}` });
    await act(async () => {
      fireEvent.click(acceptButton);
    });
    await letQueryUpdatesReachObservers();

    expect(server.acceptIncomingTeamInvite).toHaveBeenCalledWith(invite.id);
    expect(shown.activeWorkspaceId).toBe(joinedOrganization.id);
    expect(safeLocalStorage.getItem(STORED_CONTEXT_KEY)).toBe(joinedOrganization.id);
  });
});
