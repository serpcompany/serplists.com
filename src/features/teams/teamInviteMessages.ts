import { isApiError } from '@/lib/api-errors';
import type { TeamRole } from '@/lib/api';

export const formatTeamRole = (role: TeamRole): string =>
  role.charAt(0).toUpperCase() + role.slice(1);

/**
 * True when the signed-in account is not the one the invite was sent to. The
 * invite page then offers to sign out and come back as the invited account.
 */
export const isInviteEmailMismatch = (error: unknown): boolean =>
  isApiError(error) && error.status === 403 && error.code === 'invite_email_mismatch';

/** Explains why an invite link cannot be previewed, accepted, or declined. */
export function describeTeamInviteError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 403) {
      return 'This invite is for a different email address. Sign in with the invited email to accept it.';
    }
    if (error.status === 404) {
      return 'This invite is no longer available. It may have been revoked or already used.';
    }
    if (error.status === 410) {
      return 'This invite has expired. Ask an Organization admin for a new link.';
    }
  }

  return error instanceof Error && error.message
    ? error.message
    : 'Unable to load this invite.';
}
