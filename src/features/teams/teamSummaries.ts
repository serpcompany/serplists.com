import type { TeamSummary } from '@/lib/api';

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
