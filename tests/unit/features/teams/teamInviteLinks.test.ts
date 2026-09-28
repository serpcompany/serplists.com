import { describe, expect, it, vi } from 'vitest';

import {
  createInviteLink,
  getPendingInviteConflict,
  reissueInviteLink,
  visibleInviteLink,
} from '@/features/teams/teamInviteLinks';
import { ApiError } from '@/lib/api-errors';

// A lost invite link cannot be shown again (only its hash is stored), so when
// a pending invite already exists the manager is offered a new link for it
// instead of a dead-end 'Invite already pending' error.

function createdInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    email: 'newhire@example.com',
    role: 'viewer' as const,
    expiresAt: '2026-10-05T00:00:00.000Z',
    inviteToken: 'token-2',
    invitePath: '/team-invites/token-2',
    inviteUrl: 'https://serplists.com/team-invites/token-2',
    delivery: {
      mode: 'link' as const,
      status: 'ready' as const,
      invitePath: '/team-invites/token-2',
      inviteUrl: 'https://serplists.com/team-invites/token-2',
    },
    ...overrides,
  };
}

const pendingConflict = () =>
  new ApiError({
    status: 409,
    message: 'Invite already pending for this email',
    code: 'team_invite_exists',
    details: { inviteId: 'invite-1', expiresAt: '2026-10-01T00:00:00.000Z' },
  });

describe('getPendingInviteConflict', () => {
  it('reads the pending invite id from a team_invite_exists error', () => {
    expect(getPendingInviteConflict(pendingConflict())).toEqual({ inviteId: 'invite-1' });
  });

  it('ignores other errors and malformed details', () => {
    expect(getPendingInviteConflict(new Error('offline'))).toBeNull();
    expect(
      getPendingInviteConflict(new ApiError({ status: 409, message: 'x', code: 'team_member_exists' })),
    ).toBeNull();
    expect(
      getPendingInviteConflict(
        new ApiError({ status: 409, message: 'x', code: 'team_invite_exists', details: { inviteId: 42 } }),
      ),
    ).toBeNull();
  });
});

describe('createInviteLink', () => {
  it('returns the new link', async () => {
    const createInvite = vi.fn().mockResolvedValue(createdInvite());

    await expect(
      createInviteLink({ createInvite }, 'team-1', { email: 'newhire@example.com', role: 'viewer' }),
    ).resolves.toEqual({
      kind: 'created',
      link: {
        inviteId: 'invite-1',
        teamId: 'team-1',
        email: 'newhire@example.com',
        url: 'https://serplists.com/team-invites/token-2',
      },
    });
  });

  it('offers a new link for the pending invite instead of failing', async () => {
    const createInvite = vi.fn().mockRejectedValue(pendingConflict());

    await expect(
      createInviteLink({ createInvite }, 'team-1', { email: 'newhire@example.com', role: 'editor' }),
    ).resolves.toEqual({
      kind: 'pending',
      conflict: { inviteId: 'invite-1', teamId: 'team-1', email: 'newhire@example.com', role: 'editor' },
    });
  });

  it('rethrows any other failure', async () => {
    const createInvite = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(
      createInviteLink({ createInvite }, 'team-1', { email: 'newhire@example.com', role: 'viewer' }),
    ).rejects.toThrow('offline');
  });
});

describe('reissueInviteLink', () => {
  it('asks for a new link for that invite and returns it', async () => {
    const reissueInvite = vi.fn().mockResolvedValue(createdInvite({ role: 'editor' }));

    const link = await reissueInviteLink({ reissueInvite }, 'team-1', 'invite-1', 'editor');

    expect(reissueInvite).toHaveBeenCalledWith('team-1', 'invite-1', { role: 'editor' });
    expect(link).toEqual({
      inviteId: 'invite-1',
      teamId: 'team-1',
      email: 'newhire@example.com',
      url: 'https://serplists.com/team-invites/token-2',
    });
  });

  it('keeps the stored role when none is chosen', async () => {
    const reissueInvite = vi.fn().mockResolvedValue(createdInvite());

    await reissueInviteLink({ reissueInvite }, 'team-1', 'invite-1');

    expect(reissueInvite).toHaveBeenCalledWith('team-1', 'invite-1', {});
  });

  it('builds the URL from the path when the response has no absolute URL', async () => {
    const reissueInvite = vi
      .fn()
      .mockResolvedValue(createdInvite({ delivery: undefined, inviteUrl: undefined }));

    const link = await reissueInviteLink({ reissueInvite }, 'team-1', 'invite-1', undefined, 'https://app.test');

    expect(link.url).toBe('https://app.test/team-invites/token-2');
  });
});

describe('visibleInviteLink', () => {
  const link = {
    inviteId: 'invite-1',
    teamId: 'team-1',
    email: 'newhire@example.com',
    url: 'https://serplists.com/team-invites/token-2',
  };

  it('shows a link only under the Organization it belongs to', () => {
    expect(visibleInviteLink(link, 'team-1')).toBe(link);
    // A response that arrives after switching Organization is not shown under the new one.
    expect(visibleInviteLink(link, 'team-2')).toBeNull();
    expect(visibleInviteLink(null, 'team-1')).toBeNull();
  });
});
