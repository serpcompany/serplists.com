import { afterEach, describe, expect, it, vi } from 'vitest';

import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';

const acceptedInvite = (role: 'editor' | 'viewer' = 'editor') => ({
  memberId: 'member-1',
  role,
  teamId: 'team-1',
  team: {
    id: 'team-1',
    memberId: 'member-1',
    membershipStatus: 'active' as const,
    name: 'Acme Team',
    role,
  },
});

describe('acceptTeamInviteForWorkspace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts the invite and refreshes Organizations without switching the active context, which stays a separate choice', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('window', { localStorage: { setItem } });
    const calls: string[] = [];
    const acceptTeamInvite = vi.fn(async (token: string) => {
      calls.push(`accept:${token}`);
      return acceptedInvite();
    });
    const refreshTeams = vi.fn(async () => {
      calls.push('refresh');
      return [];
    });
    const rememberTeam = vi.fn(() => {
      calls.push('remember:team-1');
    });

    await expect(
      acceptTeamInviteForWorkspace('invite-token', {
        acceptTeamInvite,
        refreshTeams,
        rememberTeam,
      }),
    ).resolves.toEqual(acceptedInvite());

    expect(calls).toEqual(['accept:invite-token', 'remember:team-1', 'refresh']);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not refresh when invite acceptance fails', async () => {
    const acceptTeamInvite = vi.fn(async () => {
      throw new Error('Invite expired');
    });
    const refreshTeams = vi.fn(async () => []);

    await expect(
      acceptTeamInviteForWorkspace('expired-token', {
        acceptTeamInvite,
        refreshTeams,
      }),
    ).rejects.toThrow('Invite expired');

    expect(refreshTeams).not.toHaveBeenCalled();
  });

  it('still remembers the accepted Organization when refresh fails after receiving its data', async () => {
    const acceptTeamInvite = vi.fn(async () => acceptedInvite('viewer'));
    const refreshTeams = vi.fn(async () => {
      throw new Error('Refresh failed');
    });
    const rememberTeam = vi.fn();

    await expect(
      acceptTeamInviteForWorkspace('invite-token', {
        acceptTeamInvite,
        refreshTeams,
        rememberTeam,
      }),
    ).resolves.toEqual(expect.objectContaining({ teamId: 'team-1' }));

    expect(rememberTeam).toHaveBeenCalledWith(expect.objectContaining({ id: 'team-1' }));
  });
});
