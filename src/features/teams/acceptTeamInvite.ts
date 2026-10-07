import { api, type AcceptedTeamInvite, type TeamSummary } from '@/lib/api';

export type AcceptTeamInviteResult = AcceptedTeamInvite;

export type AcceptTeamInviteDependencies = {
  acceptTeamInvite?: (token: string) => Promise<AcceptTeamInviteResult>;
  refreshTeams: () => Promise<TeamSummary[]>;
  rememberTeam?: (team: TeamSummary) => void;
};

export async function acceptTeamInviteForWorkspace(
  token: string,
  dependencies: AcceptTeamInviteDependencies,
): Promise<AcceptTeamInviteResult> {
  const acceptInvite = dependencies.acceptTeamInvite ?? api.acceptTeamInvite.bind(api);
  const result = await acceptInvite(token);

  if (result.team) {
    dependencies.rememberTeam?.(result.team);
    void dependencies.refreshTeams().catch(() => undefined);
    return result;
  }

  await dependencies.refreshTeams();
  return result;
}
