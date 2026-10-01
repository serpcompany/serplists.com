import type { TeamMember, TeamRole } from '@/lib/api';
import type { AssignableTeamRole } from '@/features/teams/teamInviteLinks';

export const assignableRoles: AssignableTeamRole[] = ['admin', 'editor', 'runner', 'viewer'];

export const formatRole = (role: TeamRole): string => role.charAt(0).toUpperCase() + role.slice(1);

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
