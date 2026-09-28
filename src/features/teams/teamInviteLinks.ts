import { isApiError } from '@/lib/api-errors';
import type { CreatedTeamInvite, TeamRole } from '@/lib/api';
import { teamInviteExistsDetailsSchema } from '@/lib/schemas/teamInvite';

// Invite links are shown once: the server stores only a hash of the token.
// A manager who lost a link asks for a new one, which replaces the old link.

export type AssignableTeamRole = Exclude<TeamRole, 'owner'>;

/** A link the manager just received, and the invite and Organization it belongs to. */
export type InviteLink = {
  inviteId: string;
  teamId: string;
  email: string;
  url: string;
  /** When the link was received (ms); a pending list fetched before then cannot hide it. */
  issuedAt: number;
};

/** What the pending-invites query knows: the invite ids, when they were fetched, and whether that is final. */
export type PendingInvitesSnapshot = {
  inviteIds: readonly string[];
  updatedAt: number;
  isSettled: boolean;
};

/** Creating an invite found one already pending for that email. */
export type PendingInviteConflict = {
  inviteId: string;
  teamId: string;
  email: string;
  role: AssignableTeamRole;
};

export type CreateInviteLinkResult =
  | { kind: 'created'; link: InviteLink }
  | { kind: 'pending'; conflict: PendingInviteConflict };

const browserOrigin = () => (typeof window === 'undefined' ? '' : window.location.origin);

export function resolveInviteLinkUrl(invite: CreatedTeamInvite, origin = browserOrigin()): string {
  if (invite.delivery?.mode === 'link') {
    return invite.delivery.inviteUrl;
  }

  return invite.inviteUrl || `${origin}${invite.invitePath}`;
}

const toInviteLink = (teamId: string, invite: CreatedTeamInvite, origin?: string): InviteLink => ({
  inviteId: invite.id,
  teamId,
  email: invite.email,
  url: resolveInviteLinkUrl(invite, origin),
  issuedAt: Date.now(),
});

/** The pending invite named by a 409 `team_invite_exists` error, or null for any other error. */
export function getPendingInviteConflict(error: unknown): { inviteId: string } | null {
  if (!isApiError(error) || error.code !== 'team_invite_exists') {
    return null;
  }

  const details = teamInviteExistsDetailsSchema.safeParse(error.details);
  return details.success ? { inviteId: details.data.inviteId } : null;
}

export async function createInviteLink(
  deps: {
    createInvite: (
      teamId: string,
      payload: { email: string; role: AssignableTeamRole },
    ) => Promise<CreatedTeamInvite>;
  },
  teamId: string,
  payload: { email: string; role: AssignableTeamRole },
  origin?: string,
): Promise<CreateInviteLinkResult> {
  try {
    return { kind: 'created', link: toInviteLink(teamId, await deps.createInvite(teamId, payload), origin) };
  } catch (error) {
    const conflict = getPendingInviteConflict(error);
    if (!conflict) {
      throw error;
    }

    return { kind: 'pending', conflict: { ...conflict, teamId, email: payload.email, role: payload.role } };
  }
}

/** Gives a pending invite a new link. Without a role the invite keeps its current one. */
export async function reissueInviteLink(
  deps: {
    reissueInvite: (
      teamId: string,
      inviteId: string,
      payload: { role?: AssignableTeamRole },
    ) => Promise<CreatedTeamInvite>;
  },
  teamId: string,
  inviteId: string,
  role?: AssignableTeamRole,
  origin?: string,
): Promise<InviteLink> {
  const invite = await deps.reissueInvite(teamId, inviteId, role ? { role } : {});
  return toInviteLink(teamId, invite, origin);
}

/**
 * The link to show under the active Organization. A late reply for another
 * Organization is hidden, and so is a link whose invite has left the pending
 * list (revoked here or elsewhere, accepted, or expired), since copying it
 * would hand out a dead link. A list fetched before the link was issued, or
 * one still loading, cannot hide it.
 */
export function visibleInviteLink(
  link: InviteLink | null,
  activeTeamId: string | null | undefined,
  pending?: PendingInvitesSnapshot,
): InviteLink | null {
  if (!link || link.teamId !== activeTeamId) {
    return null;
  }

  const inviteLeftPendingList =
    pending?.isSettled && pending.updatedAt > link.issuedAt && !pending.inviteIds.includes(link.inviteId);
  return inviteLeftPendingList ? null : link;
}

/**
 * The invite email field once a link for `linkEmail` is ready: cleared if it
 * still holds that email, kept if the manager typed another address while the
 * link was being created. Emails compare like the API stores them (trimmed,
 * lowercase).
 */
export const inviteEmailAfterLink = (fieldValue: string, linkEmail: string): string =>
  fieldValue.trim().toLowerCase() === linkEmail.trim().toLowerCase() ? '' : fieldValue;

/** Drops the shown link when its invite was just revoked; a newer link for another invite stays. */
export const withoutRevokedLink = (link: InviteLink | null, inviteId: string): InviteLink | null =>
  link?.inviteId === inviteId ? null : link;

/** Revoking answered 404: the invite was already revoked, accepted, or expired, so its link is dead. */
export const isInviteGoneError = (error: unknown): boolean => isApiError(error) && error.status === 404;

// The invitee accepted the invite before the revoke reached the server: they are a member now.
export const isInviteAlreadyAcceptedError = (error: unknown): boolean =>
  isApiError(error) && error.status === 409 && error.code === 'invite_already_accepted';
