import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { api, type TeamSummary } from '@/lib/api';

const PERSONAL_CONTEXT_ID = 'personal';

type AfterLeaveDependencies = {
  activeTeamId?: string;
  refreshTeams: () => Promise<TeamSummary[]>;
  selectWorkspace: (workspaceId: string) => void;
};

/**
 * After leaving an Organization: return to Personal if it was the active
 * context (selectWorkspace also stores the choice and refetches Templates and
 * Runs), then reload the Organization list so it drops out of the switcher.
 */
export async function afterLeavingOrganization(
  teamId: string,
  { activeTeamId, refreshTeams, selectWorkspace }: AfterLeaveDependencies,
): Promise<void> {
  if (activeTeamId === teamId) {
    selectWorkspace(PERSONAL_CONTEXT_ID);
  }

  await refreshTeams().catch(() => undefined);
}

export function useLeaveOrganization() {
  const queryClient = useQueryClient();
  const { activeTeamId, refreshTeams, selectWorkspace } = useWorkspace();

  const mutation = useMutation({
    mutationFn: (teamId: string) => api.leaveTeam(teamId),
    onSuccess: async (_result, teamId) => {
      await afterLeavingOrganization(teamId, { activeTeamId, refreshTeams, selectWorkspace });
      queryClient.removeQueries({ queryKey: ['team-members', teamId] });
    },
  });

  return {
    leaveOrganization: (teamId: string) => mutation.mutateAsync(teamId),
    isLeaving: mutation.isPending,
  };
}
