import type { Env } from '../types';
import { getActiveTeamMembership, normalizeTeamRole, type TeamRole } from './team-access';

export type OwnershipColumns = { team_id: string | null; user_id: string };

export async function ownerGrants(
  env: Env,
  owner: OwnershipColumns,
  userId: string,
  teamRoleGrants: (role: TeamRole) => boolean,
): Promise<boolean> {
  if (owner.team_id) {
    const membership = await getActiveTeamMembership(env, owner.team_id, userId);
    return membership ? teamRoleGrants(normalizeTeamRole(membership.role)) : false;
  }

  return owner.user_id === userId;
}
