import { describe, expect, it, vi } from 'vitest';

import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';

describe('acceptTeamInviteForWorkspace', () => {
  it('accepts the invite, refreshes teams, and selects the accepted team', async () => {
    const calls: string[] = [];
    const acceptTeamInvite = vi.fn(async (token: string) => {
      calls.push(`accept:${token}`);
      return {
        memberId: 'member-1',
        role: 'editor' as const,
        teamId: 'team-1',
        team: {
          id: 'team-1',
          memberId: 'member-1',
          membershipStatus: 'active' as const,
          name: 'Acme Team',
          role: 'editor' as const,
        },
      };
    });
    const refreshTeams = vi.fn(async () => {
      calls.push('refresh');
      return [];
    });
    const rememberTeam = vi.fn(() => {
      calls.push('remember:team-1');
    });
    const selectWorkspace = vi.fn((workspaceId: string) => {
      calls.push(`select:${workspaceId}`);
    });

    await expect(
      acceptTeamInviteForWorkspace('invite-token', {
        acceptTeamInvite,
        refreshTeams,
        rememberTeam,
        selectWorkspace,
      }),
    ).resolves.toEqual({
      memberId: 'member-1',
      role: 'editor',
      teamId: 'team-1',
      team: {
        id: 'team-1',
        memberId: 'member-1',
        membershipStatus: 'active',
        name: 'Acme Team',
        role: 'editor',
      },
    });

    expect(calls).toEqual([
      'accept:invite-token',
      'remember:team-1',
      'select:team-1',
      'refresh',
    ]);
  });

  it('does not select a workspace when invite acceptance fails', async () => {
    const acceptTeamInvite = vi.fn(async () => {
      throw new Error('Invite expired');
    });
    const refreshTeams = vi.fn(async () => []);
    const selectWorkspace = vi.fn();

    await expect(
      acceptTeamInviteForWorkspace('expired-token', {
        acceptTeamInvite,
        refreshTeams,
        selectWorkspace,
      }),
    ).rejects.toThrow('Invite expired');

    expect(refreshTeams).not.toHaveBeenCalled();
    expect(selectWorkspace).not.toHaveBeenCalled();
  });

  it('still selects the accepted team when refresh fails after receiving team data', async () => {
    const acceptTeamInvite = vi.fn(async () => ({
      memberId: 'member-1',
      role: 'viewer' as const,
      teamId: 'team-1',
      team: {
        id: 'team-1',
        memberId: 'member-1',
        membershipStatus: 'active' as const,
        name: 'Acme Team',
        role: 'viewer' as const,
      },
    }));
    const refreshTeams = vi.fn(async () => {
      throw new Error('Refresh failed');
    });
    const rememberTeam = vi.fn();
    const selectWorkspace = vi.fn();

    await expect(
      acceptTeamInviteForWorkspace('invite-token', {
        acceptTeamInvite,
        refreshTeams,
        rememberTeam,
        selectWorkspace,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        teamId: 'team-1',
      }),
    );

    expect(rememberTeam).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'team-1' }),
    );
    expect(selectWorkspace).toHaveBeenCalledWith('team-1');
  });
});
