import { act } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreatedTeamInvite, TeamInvite } from '@/lib/api';

import { installFakeDomGlobals } from '../../../fixtures/fakeDom';
import { deferred } from '../../../support/deferred';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';

const apiMocks = vi.hoisted(() => ({
  createTeamInvite: vi.fn(),
  getTeamInvites: vi.fn(),
  reissueTeamInviteLink: vi.fn(),
  revokeTeamInvite: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { useTeamInvites } from '@/features/teams/useTeamInvites';

const createdInvite: CreatedTeamInvite = {
  id: 'invite-1',
  email: 'newhire@example.com',
  role: 'viewer',
  expiresAt: '2026-10-07T00:00:00.000Z',
  inviteToken: 'token-1',
  invitePath: '/team-invites/token-1/',
  inviteUrl: 'https://serplists.com/team-invites/token-1/',
};

const pendingInvite: TeamInvite = {
  id: 'invite-1',
  team_id: 'team-1',
  email: 'newhire@example.com',
  role: 'viewer',
  invited_by_user_id: 'user-1',
  expires_at: '2026-10-07T00:00:00.000Z',
  created_at: '2026-09-30T00:00:00.000Z',
};

let restoreGlobals: () => void;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals({
    location: { origin: 'https://serplists.com' },
    addEventListener() {},
    removeEventListener() {},
  });
});
afterAll(() => restoreGlobals());

const unmounts: Array<() => void> = [];
beforeEach(() => {
  Object.values(apiMocks).forEach((mock) => mock.mockReset());
  apiMocks.getTeamInvites.mockResolvedValue([pendingInvite]);
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function mountInvitesPanel() {
  const panel = await mountQueryHook(() => useTeamInvites('team-1', true));
  unmounts.push(panel.unmount);
  return panel.current;
}

describe('useTeamInvites', () => {
  it('sends one request for a double click on Create invite, or New link while it runs, so no link is replaced twice and left dead on screen', async () => {
    const created = deferred<CreatedTeamInvite>();
    apiMocks.createTeamInvite.mockReturnValue(created.promise);
    const invites = await mountInvitesPanel();

    let creating: Promise<unknown> | undefined;
    await act(async () => {
      creating = invites().createInvite('team-1', 'newhire@example.com', 'viewer');
      void invites().createInvite('team-1', 'newhire@example.com', 'viewer');
      void invites().reissueLink('team-1', 'invite-2');
    });

    expect(apiMocks.createTeamInvite).toHaveBeenCalledTimes(1);
    expect(apiMocks.reissueTeamInviteLink).not.toHaveBeenCalled();

    created.resolve(createdInvite);
    await act(async () => {
      await creating;
      await settle();
    });
    expect(invites().link?.url).toBe('https://serplists.com/team-invites/token-1/');
  });

  it("hides a revoked invite's link as soon as the revoke succeeds, without waiting for the pending list to reload", async () => {
    apiMocks.createTeamInvite.mockResolvedValue(createdInvite);
    const invites = await mountInvitesPanel();
    await act(async () => {
      await invites().createInvite('team-1', 'newhire@example.com', 'viewer');
      await settle();
    });
    expect(invites().link?.inviteId).toBe('invite-1');

    const reloadedList = deferred<TeamInvite[]>();
    apiMocks.getTeamInvites.mockReturnValue(reloadedList.promise);
    apiMocks.revokeTeamInvite.mockResolvedValue({ success: true });
    let revoking: Promise<unknown> | undefined;
    await act(async () => {
      revoking = invites().revokeInvite('team-1', 'invite-1');
      await settle();
    });

    expect(apiMocks.getTeamInvites).toHaveBeenCalledTimes(3);
    expect(invites().link).toBeNull();

    reloadedList.resolve([]);
    await act(async () => {
      await revoking;
      await settle();
    });
  });
});
