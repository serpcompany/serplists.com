import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingInvite } from '../../../fixtures/teamInvites';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';

const signedIn = vi.hoisted(() => ({ user: { id: 'user-1' } }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => signedIn }));
const teamApi = vi.hoisted(() => ({ getTeamMembers: vi.fn(), getTeamActivity: vi.fn(), getTeamInvites: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: teamApi }));

import { useTeamInvites } from '@/features/teams/useTeamInvites';
import { useTeamSettingsQueries } from '@/features/teams/useTeamSettingsQueries';

const unmounts: Array<() => void> = [];
beforeEach(() => {
  Object.values(teamApi).forEach((mock) => mock.mockReset());
  teamApi.getTeamMembers.mockResolvedValue([]);
  teamApi.getTeamActivity.mockResolvedValue([]);
  teamApi.getTeamInvites.mockResolvedValue([]);
});
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

describe("the Organization settings page's lists", () => {
  it('loads nothing before an Organization is chosen', async () => {
    const page = await mountQueryHook(() => useTeamSettingsQueries({ activeTeamId: undefined, canManageTeam: true }));
    unmounts.push(page.unmount);
    await act(settle);

    expect(teamApi.getTeamMembers).not.toHaveBeenCalled();
    expect(teamApi.getTeamActivity).not.toHaveBeenCalled();
    expect(page.current().membersQuery.data).toBeUndefined();
  });

  it('reloads the pending invites the invites panel shows', async () => {
    const page = await mountQueryHook(() => ({
      settings: useTeamSettingsQueries({ activeTeamId: 'team-1', canManageTeam: true }),
      invitesPanel: useTeamInvites('team-1', true),
    }));
    unmounts.push(page.unmount);
    await act(settle);
    expect(teamApi.getTeamInvites).toHaveBeenCalledTimes(1);

    teamApi.getTeamInvites.mockResolvedValue([pendingInvite]);
    await act(async () => {
      await page.current().settings.reload.invites();
      await settle();
    });

    expect(teamApi.getTeamInvites).toHaveBeenCalledTimes(2);
    expect(page.current().invitesPanel.invites.map(({ email }) => email)).toEqual(['newhire@example.com']);
  });
});
