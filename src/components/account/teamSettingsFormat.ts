import type { TeamRole } from '@/lib/api';
import type { AssignableTeamRole } from '@/features/teams/teamInviteLinks';

// Display helpers shared by the Organization settings sections.

export const assignableRoles: AssignableTeamRole[] = ['admin', 'editor', 'runner', 'viewer'];

export const formatRole = (role: TeamRole): string => role.charAt(0).toUpperCase() + role.slice(1);

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
