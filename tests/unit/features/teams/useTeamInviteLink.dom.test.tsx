import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AcceptedTeamInvite } from '@/lib/api';

import { deferred } from '../../../support/deferred';
import { mountQueryHook, settle } from '../../../support/queryHookProbe';

const apiMocks = vi.hoisted(() => ({
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  getTeamInvitePreview: vi.fn(),
}));
const workspace = vi.hoisted(() => ({
  refreshTeams: async () => [],
  rememberTeam: () => undefined,
  selectWorkspace: () => undefined,
}));
vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => workspace }));

import { useTeamInviteLink } from '@/features/teams/useTeamInviteLink';

const unmounts: Array<() => void> = [];
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount());
});

async function openInvite() {
  apiMocks.getTeamInvitePreview.mockResolvedValue({
    status: 'pending',
    teamId: 'team-1',
    teamName: 'Acme Corp',
    role: 'viewer',
    expiresAt: '2026-10-07T00:00:00.000Z',
  });
  const page = await mountQueryHook(() => useTeamInviteLink('invite-token', 'user-1'));
  unmounts.push(page.unmount);
  return page.current;
}

describe('useTeamInviteLink', () => {
  it('sends one answer for a double click on Accept followed by Decline, since Accept and Decline share one guard', async () => {
    const accepted = deferred<AcceptedTeamInvite>();
    apiMocks.acceptTeamInvite.mockReturnValue(accepted.promise);
    const invite = await openInvite();

    let accepting: Promise<unknown> | undefined;
    await act(async () => {
      accepting = invite().accept();
      void invite().accept();
      void invite().decline();
      await settle();
    });

    expect(apiMocks.acceptTeamInvite).toHaveBeenCalledTimes(1);
    expect(apiMocks.declineTeamInvite).not.toHaveBeenCalled();

    accepted.resolve({ memberId: 'member-1', role: 'viewer', teamId: 'team-1' });
    await act(async () => {
      await accepting;
      await settle();
    });
    expect(invite().isAccepted).toBe(true);
  });
});
