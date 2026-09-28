import type { TeamMember, TeamRole } from '@/lib/api';
import type { AssignableTeamRole } from '@/features/teams/teamInviteLinks';

// Display helpers shared by the Organization settings sections.

export const assignableRoles: AssignableTeamRole[] = ['admin', 'editor', 'runner', 'viewer'];

export const formatRole = (role: TeamRole): string => role.charAt(0).toUpperCase() + role.slice(1);

/**
 * Names a member in the accessible names of that member's row controls
 * ("Role for Alice (alice@example.com)"). It adds the email, or the user id
 * when there is none, so two members with the same name stay distinct.
 */
export const describeMemberForControls = (
  member: Pick<TeamMember, 'email' | 'name' | 'user_id'>,
): string => {
  const primary = member.name || member.email || member.user_id;
  const secondary = member.email || member.user_id;
  return primary === secondary ? primary : `${primary} (${secondary})`;
};

export const formatInviteExpiration = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown expiration';
  }

  return `Expires ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
};
