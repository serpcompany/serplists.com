import type { TeamSummary } from '@/lib/api';

/**
 * Applies a change the server already confirmed (for example the previous
 * owner becoming an admin) to a cached Organization list, in place. Returns
 * the same list when the Organization is not in it.
 */
export function patchTeamSummary(
  teams: TeamSummary[],
  teamId: string,
  patch: Partial<Omit<TeamSummary, 'id'>>,
): TeamSummary[] {
  if (!teams.some((team) => team.id === teamId)) {
    return teams;
  }

  return teams.map((team) => (team.id === teamId ? { ...team, ...patch } : team));
}
