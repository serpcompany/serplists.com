import { isApiError } from '@/lib/api-errors';
import type { CreatedTeamInvite, TeamRole } from '@/lib/api';
import { teamInviteExistsDetailsSchema } from '@/lib/schemas/teamInvite';

export type AssignableTeamRole = Exclude<TeamRole, 'owner'>;

export type InviteLink = {
  inviteId: string;
  teamId: string;
  email: string;
  url: string;
  issuedAt: number;
};

export type PendingInvitesSnapshot = {
  inviteIds: readonly string[];
  updatedAt: number;
  isSettled: boolean;
};

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

function resolveInviteLinkUrl(invite: CreatedTeamInvite, origin = browserOrigin()): string {
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

export const inviteEmailAfterLink = (fieldValue: string, linkEmail: string): string =>
  fieldValue.trim().toLowerCase() === linkEmail.trim().toLowerCase() ? '' : fieldValue;

export const withoutRevokedLink = (link: InviteLink | null, inviteId: string): InviteLink | null =>
  link?.inviteId === inviteId ? null : link;

export const isInviteGoneError = (error: unknown): boolean => isApiError(error) && error.status === 404;

export const isInviteAlreadyAcceptedError = (error: unknown): boolean =>
  isApiError(error) && error.status === 409 && error.code === 'invite_already_accepted';
