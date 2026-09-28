import { api, type AcceptedTeamInvite, type TeamSummary } from '@/lib/api';

const ACTIVE_WORKSPACE_STORAGE_KEY = 'serplists.activeWorkspaceId';

export type AcceptTeamInviteResult = AcceptedTeamInvite;

export type AcceptTeamInviteDependencies = {
  acceptTeamInvite?: (token: string) => Promise<AcceptTeamInviteResult>;
  refreshTeams: () => Promise<TeamSummary[]>;
  rememberTeam?: (team: TeamSummary) => void;
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

/**
 * Accepts an invite link and adds the Organization to the context list. It does
 * not switch the active context: the invite page offers "Switch to" as a
 * separate choice, so new Templates and Runs never land in an Organization the
 * user did not pick.
 */
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
