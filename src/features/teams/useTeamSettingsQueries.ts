import { skipToken, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { reloadObservedQueries } from '@/features/teams/reloadObservedQueries';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

const cancelThenRefetch =
  (queryClient: QueryClient, query: { refetch: () => Promise<unknown> }, queryKey: QueryKey) => async () => {
    await queryClient.cancelQueries({ queryKey });
    await query.refetch();
  };

export function useTeamSettingsQueries({ activeTeamId, canManageTeam }: { activeTeamId?: string | undefined; canManageTeam: boolean }) {
  const userId = useAuth().user?.id;
  const queryClient = useQueryClient();
  const signedIn = Boolean(userId);
  const keys = {
    members: queryKeys.teamMembers(userId, activeTeamId),
    activity: queryKeys.teamActivity(userId, activeTeamId),
    invites: queryKeys.teamInvites(userId, activeTeamId),
  };

  const membersQuery = useQuery({
    queryKey: keys.members,
    queryFn: activeTeamId ? () => api.getTeamMembers(activeTeamId) : skipToken,
    enabled: signedIn && Boolean(activeTeamId),
    staleTime: 60 * 1000,
  });
  const activityQuery = useQuery({
    queryKey: keys.activity,
    queryFn: activeTeamId ? () => api.getTeamActivity(activeTeamId) : skipToken,
    enabled: signedIn && Boolean(activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
  });

  return {
    membersQuery,
    activityQuery,
    reload: {
      members: cancelThenRefetch(queryClient, membersQuery, keys.members),
      activity: cancelThenRefetch(queryClient, activityQuery, keys.activity),
      invites: () => reloadObservedQueries(queryClient, keys.invites),
    },
  };
}

export function useIncomingTeamInvites() {
  const userId = useAuth().user?.id;
  const queryClient = useQueryClient();
  const queryKey = queryKeys.incomingTeamInvites(userId);
  const incomingInvitesQuery = useQuery({
    queryKey,
    queryFn: () => api.getIncomingTeamInvites(),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });

  return {
    incomingInvitesQuery,
    reloadIncomingInvites: cancelThenRefetch(queryClient, incomingInvitesQuery, queryKey),
  };
}
