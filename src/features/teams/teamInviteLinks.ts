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

/** The link to show under the active Organization; a late reply for another one is hidden. */
export function visibleInviteLink(link: InviteLink | null, activeTeamId: string | null | undefined) {
  return link && link.teamId === activeTeamId ? link : null;
}
