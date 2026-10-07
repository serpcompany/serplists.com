import { describe, expect, it, vi } from 'vitest';

import {
  createInviteLink,
  getPendingInviteConflict,
  inviteEmailAfterLink,
  isInviteGoneError,
  reissueInviteLink,
  visibleInviteLink,
  withoutRevokedLink,
} from '@/features/teams/teamInviteLinks';
import { ApiError } from '@/lib/api-errors';
import { anyInstanceOf } from '../../../support/asymmetricMatchers';

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
        issuedAt: anyInstanceOf(Number),
      },
    });
  });

  it('offers a new link for the pending invite instead of failing, since a lost link cannot be shown again', async () => {
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
      issuedAt: anyInstanceOf(Number),
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
  const issuedAt = 1_000;
  const link = {
    inviteId: 'invite-1',
    teamId: 'team-1',
    email: 'newhire@example.com',
    url: 'https://serplists.com/team-invites/token-2',
    issuedAt,
  };
  const pending = (inviteIds: string[], overrides: Record<string, unknown> = {}) => ({
    inviteIds,
    updatedAt: issuedAt + 500,
    isSettled: true,
    ...overrides,
  });

  it('shows a link only under the Organization it belongs to, so one that lands after a switch is not shown under the new one', () => {
    expect(visibleInviteLink(link, 'team-1')).toBe(link);
    expect(visibleInviteLink(link, 'team-2')).toBeNull();
    expect(visibleInviteLink(null, 'team-1')).toBeNull();
  });

  it('shows the link while its invite is still pending', () => {
    expect(visibleInviteLink(link, 'team-1', pending(['invite-1', 'invite-2']))).toBe(link);
  });

  it('hides the link once the pending list no longer has its invite, revoked, accepted or expired, so a dead link cannot be copied', () => {
    expect(visibleInviteLink(link, 'team-1', pending(['invite-2']))).toBeNull();
  });

  it('keeps a new link while the list that predates it is shown or reloading', () => {
    expect(visibleInviteLink(link, 'team-1', pending([], { updatedAt: issuedAt - 1 }))).toBe(link);
    expect(visibleInviteLink(link, 'team-1', pending([], { isSettled: false }))).toBe(link);
  });
});

describe('withoutRevokedLink', () => {
  const link = {
    inviteId: 'invite-1',
    teamId: 'team-1',
    email: 'bob@exmaple.com',
    url: 'https://serplists.com/team-invites/token-1',
    issuedAt: 1_000,
  };

  it('drops the link of the invite that was revoked', () => {
    expect(withoutRevokedLink(link, 'invite-1')).toBeNull();
  });

  it('keeps the link when another invite was revoked', () => {
    expect(withoutRevokedLink(link, 'invite-2')).toBe(link);
    expect(withoutRevokedLink(null, 'invite-1')).toBeNull();
  });
});

describe('isInviteGoneError', () => {
  it('treats a 404 from revoking as an invite that is already gone', () => {
    expect(isInviteGoneError(new ApiError({ status: 404, message: 'Invite not found' }))).toBe(true);
  });

  it('keeps the link for other failures', () => {
    expect(isInviteGoneError(new ApiError({ status: 500, message: 'Server error' }))).toBe(false);
    expect(isInviteGoneError(new ApiError({ status: 403, message: 'Forbidden' }))).toBe(false);
    expect(isInviteGoneError(new Error('Failed to fetch'))).toBe(false);
  });
});

describe('inviteEmailAfterLink', () => {
  it('clears the field that still holds the email the link was created for, compared trimmed and lowercase as the API stores it', () => {
    expect(inviteEmailAfterLink('bob@exmaple.com', 'bob@exmaple.com')).toBe('');
    expect(inviteEmailAfterLink(' Bob@Exmaple.com ', 'bob@exmaple.com')).toBe('');
  });

  it('keeps an address typed while the link was being created', () => {
    expect(inviteEmailAfterLink('kept@example.com', 'bob@exmaple.com')).toBe('kept@example.com');
    expect(inviteEmailAfterLink('bob@exmaple.co', 'bob@exmaple.com')).toBe('bob@exmaple.co');
  });
});
