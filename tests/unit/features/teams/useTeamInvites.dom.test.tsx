import { act, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreatedTeamInvite } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

import { createdInvite, pendingInvite, type PendingTeamInvite } from '../../../fixtures/teamInvites';
import { deferred } from '../../../support/deferred';
import { navigation } from '../../../support/nextNavigation';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';

const apiMocks = vi.hoisted(() => ({
  createTeamInvite: vi.fn(),
  getTeamInvites: vi.fn(),
  reissueTeamInviteLink: vi.fn(),
  revokeTeamInvite: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

import { useTeamInvites } from '@/features/teams/useTeamInvites';

theInMemoryBrowserAsTheWindow();

const unmounts: Array<() => void> = [];
beforeEach(() => {
  navigation.reset('https://serplists.com/dashboard/settings/');
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

async function mountInvitesPanelThatSwitchesOrganization() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let shown: { invites: ReturnType<typeof useTeamInvites>; switchTo: (teamId: string | null) => void } | undefined;
  function Panel() {
    const [teamId, switchTo] = useState<string | null>('team-1');
    shown = { invites: useTeamInvites(teamId, true), switchTo };
    return null;
  }
  const { unmount } = await renderSettled(
    <QueryClientProvider client={queryClient}>
      <Panel />
    </QueryClientProvider>,
  );
  unmounts.push(() => {
    unmount();
    queryClient.clear();
  });
  const current = () => {
    if (!shown) throw new Error('The invites panel did not render');
    return shown;
  };
  return { invites: () => current().invites, switchTo: (teamId: string | null) => act(async () => current().switchTo(teamId)) };
}

const alreadyInvited = new ApiError({ status: 409, message: 'Already invited', code: 'team_invite_exists', details: { inviteId: 'invite-9' } });

async function showALinkFor(invites: () => ReturnType<typeof useTeamInvites>) {
  apiMocks.createTeamInvite.mockResolvedValue(createdInvite);
  await act(async () => {
    await invites().createInvite('team-1', 'newhire@example.com', 'viewer');
    await settle();
  });
  expect(invites().link?.inviteId).toBe('invite-1');
}

async function revokeFailingWith(invites: () => ReturnType<typeof useTeamInvites>, error: ApiError) {
  apiMocks.revokeTeamInvite.mockRejectedValue(error);
  await act(async () => {
    await expect(invites().revokeInvite('team-1', 'invite-1')).rejects.toBe(error);
    await settle();
  });
  expect(invites().revokingInviteId).toBeNull();
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

    const reloadedList = deferred<PendingTeamInvite[]>();
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

  it('shows a new link for a pending invite, with the role it was changed to', async () => {
    const reissued = deferred<CreatedTeamInvite>();
    apiMocks.reissueTeamInviteLink.mockReturnValue(reissued.promise);
    const invites = await mountInvitesPanel();

    let reissuing: Promise<unknown> | undefined;
    await act(async () => {
      reissuing = invites().reissueLink('team-1', 'invite-1', 'editor');
      await settle();
    });
    expect(invites().reissuingInviteId).toBe('invite-1');

    reissued.resolve({ ...createdInvite, role: 'editor', inviteUrl: 'https://serplists.com/team-invites/token-2/' });
    await act(async () => {
      await reissuing;
      await settle();
    });

    expect(apiMocks.reissueTeamInviteLink).toHaveBeenCalledWith('team-1', 'invite-1', { role: 'editor' });
    expect(invites().link?.url).toBe('https://serplists.com/team-invites/token-2/');
    expect(invites().reissuingInviteId).toBeNull();
    expect(apiMocks.getTeamInvites).toHaveBeenCalledTimes(2);
  });

  it('offers the pending invite instead of a link when the person is already invited, until it is dismissed', async () => {
    apiMocks.createTeamInvite.mockRejectedValue(alreadyInvited);
    const invites = await mountInvitesPanel();

    await act(async () => {
      expect(await invites().createInvite('team-1', 'newhire@example.com', 'editor')).toMatchObject({ kind: 'pending' });
    });

    expect(invites().conflict).toEqual({ inviteId: 'invite-9', teamId: 'team-1', email: 'newhire@example.com', role: 'editor' });
    expect(invites().link).toBeNull();
    expect(invites().isCreating).toBe(false);

    await act(async () => invites().dismissConflict());
    expect(invites().conflict).toBeNull();
  });

  it('hides the link and reloads the list when the invite was accepted before it could be revoked', async () => {
    const invites = await mountInvitesPanel();
    await showALinkFor(invites);
    const loadsBefore = apiMocks.getTeamInvites.mock.calls.length;

    await revokeFailingWith(invites, new ApiError({ status: 409, message: 'Accepted', code: 'invite_already_accepted' }));

    expect(invites().link).toBeNull();
    expect(apiMocks.getTeamInvites.mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it('hides the link and reloads the list when the invite is already gone', async () => {
    const invites = await mountInvitesPanel();
    await showALinkFor(invites);
    const loadsBefore = apiMocks.getTeamInvites.mock.calls.length;

    await revokeFailingWith(invites, new ApiError({ status: 404, message: 'Not found' }));

    expect(invites().link).toBeNull();
    expect(apiMocks.getTeamInvites.mock.calls.length).toBeGreaterThan(loadsBefore);
  });

  it('keeps the link when a revoke fails for another reason', async () => {
    const invites = await mountInvitesPanel();
    await showALinkFor(invites);
    const loadsBefore = apiMocks.getTeamInvites.mock.calls.length;

    await revokeFailingWith(invites, new ApiError({ status: 500, message: 'Server error' }));

    expect(invites().link?.inviteId).toBe('invite-1');
    expect(apiMocks.getTeamInvites).toHaveBeenCalledTimes(loadsBefore);
  });

  it("drops one Organization's link and conflict when another is chosen, and loads nothing with none chosen", async () => {
    const panel = await mountInvitesPanelThatSwitchesOrganization();
    await showALinkFor(panel.invites);
    apiMocks.createTeamInvite.mockRejectedValue(alreadyInvited);
    await act(async () => {
      await panel.invites().createInvite('team-1', 'other@example.com', 'viewer');
    });
    expect(panel.invites().conflict?.inviteId).toBe('invite-9');

    await panel.switchTo('team-2');
    await act(settle);
    expect(panel.invites().link).toBeNull();
    expect(panel.invites().conflict).toBeNull();
    expect(apiMocks.getTeamInvites).toHaveBeenLastCalledWith('team-2');
    await panel.switchTo('team-1');
    expect(panel.invites().link).toBeNull();
    expect(panel.invites().conflict).toBeNull();

    await panel.switchTo(null);
    const loads = apiMocks.getTeamInvites.mock.calls.length;
    await act(async () => {
      await panel.invites().reloadInvites();
    });
    expect(panel.invites().invites).toEqual([]);
    expect(apiMocks.getTeamInvites).toHaveBeenCalledTimes(loads);
  });

  it('reloads the pending list when asked', async () => {
    const invites = await mountInvitesPanel();
    apiMocks.getTeamInvites.mockResolvedValue([]);

    await act(async () => {
      await invites().reloadInvites();
      await settle();
    });

    expect(invites().invites).toEqual([]);
  });
});
