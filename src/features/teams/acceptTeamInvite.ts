import { api, type AcceptedTeamInvite, type TeamSummary } from '@/lib/api';

const ACTIVE_WORKSPACE_STORAGE_KEY = 'serplists.activeWorkspaceId';

export type AcceptTeamInviteResult = AcceptedTeamInvite;

export type AcceptTeamInviteDependencies = {
  acceptTeamInvite?: (token: string) => Promise<AcceptTeamInviteResult>;
  refreshTeams: () => Promise<TeamSummary[]>;
  rememberTeam?: (team: TeamSummary) => void;
  selectWorkspace: (workspaceId: string) => void;
};

export function persistAcceptedWorkspace(workspaceId: string): void {
  if (typeof window === 'undefined' || !workspaceId) {
    return;
  }

  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  } catch {
    // The context selection still handles in-memory state when storage is unavailable.
  }
}

export async function acceptTeamInviteForWorkspace(
  token: string,
  dependencies: AcceptTeamInviteDependencies,
): Promise<AcceptTeamInviteResult> {
  const acceptInvite = dependencies.acceptTeamInvite ?? api.acceptTeamInvite.bind(api);
  const result = await acceptInvite(token);

  if (result.team) {
    dependencies.rememberTeam?.(result.team);
    persistAcceptedWorkspace(result.teamId);
    dependencies.selectWorkspace(result.teamId);
    void dependencies.refreshTeams().catch(() => undefined);
    return result;
  }

  await dependencies.refreshTeams();
  persistAcceptedWorkspace(result.teamId);
  dependencies.selectWorkspace(result.teamId);

  return result;
}
