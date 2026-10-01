import { api, type AcceptedTeamInvite, type TeamSummary } from '@/lib/api';
import { safeLocalStorage } from '@/lib/browserStorage';

const ACTIVE_WORKSPACE_STORAGE_KEY = 'serplists.activeWorkspaceId';

export type AcceptTeamInviteResult = AcceptedTeamInvite;

export type AcceptTeamInviteDependencies = {
  acceptTeamInvite?: (token: string) => Promise<AcceptTeamInviteResult>;
  refreshTeams: () => Promise<TeamSummary[]>;
  rememberTeam?: (team: TeamSummary) => void;
};

export function persistAcceptedWorkspace(workspaceId: string): void {
  if (!workspaceId) {
    return;
  }

  safeLocalStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
}

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
