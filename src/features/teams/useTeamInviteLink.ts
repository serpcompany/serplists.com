import { useState } from 'react';
import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';
import { api } from '@/lib/api';
import { queryKindPrefix } from '@/lib/queryKeys';
import { createSingleFlight } from '@/lib/utils/singleFlight';

const INVITE_RESPONSE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId));
  });
}

const respondWithTimeout = <T>(task: Promise<T>) =>
  withTimeout(
    task,
    INVITE_RESPONSE_TIMEOUT_MS,
    'The invite is taking longer than expected. Refresh this page and try again.',
  );

export const teamInvitePreviewQueryKey = (token: string | undefined, viewerId: string | null) => [
  'team-invite-preview',
  token,
  viewerId,
];

export function useTeamInviteLink(token: string | undefined, viewerId: string | null) {
  const queryClient = useQueryClient();
  const { refreshTeams, rememberTeam, selectWorkspace } = useWorkspace();
  const [responseFlight] = useState(() => createSingleFlight());

  const refreshIncomingInvites = () =>
    queryClient.invalidateQueries({ queryKey: queryKindPrefix('incomingTeamInvites') });
  const stopReadingPreview = (_result: unknown, respondedAs: string | null) =>
    queryClient.cancelQueries({ queryKey: teamInvitePreviewQueryKey(token, respondedAs) });
  const inviteToken = (): string => {
    if (!token) throw new Error('This invite link has no token.');
    return token;
  };

  const acceptMutation = useMutation({
    mutationFn: (_respondedAs: string | null) =>
      respondWithTimeout(
        acceptTeamInviteForWorkspace(inviteToken(), { refreshTeams, rememberTeam }),
      ),
    onSuccess: stopReadingPreview,
    onSettled: refreshIncomingInvites,
  });

  const declineMutation = useMutation({
    mutationFn: (_respondedAs: string | null) =>
      respondWithTimeout(api.declineTeamInvite(inviteToken())),
    onSuccess: stopReadingPreview,
    onSettled: refreshIncomingInvites,
  });

  const isAccepted = acceptMutation.isSuccess && acceptMutation.variables === viewerId;
  const isDeclined = declineMutation.isSuccess && declineMutation.variables === viewerId;
  const hasAnswered = isAccepted || isDeclined;

  const previewQuery = useQuery({
    queryKey: teamInvitePreviewQueryKey(token, viewerId),
    queryFn: token ? () => api.getTeamInvitePreview(token) : skipToken,
    enabled: Boolean(token) && Boolean(viewerId) && !hasAnswered,
    retry: false,
    staleTime: 0,
  });

  return {
    preview: previewQuery.data,
    previewError: previewQuery.error,
    isPreviewLoading: previewQuery.isLoading,
    accept: () => responseFlight.run(() => acceptMutation.mutateAsync(viewerId)),
    acceptError: acceptMutation.error,
    isAccepted,
    decline: () => responseFlight.run(() => declineMutation.mutateAsync(viewerId)),
    declineError: declineMutation.error,
    isDeclined,
    isResponding: acceptMutation.isPending || declineMutation.isPending,
    switchToOrganization: (teamId: string) => selectWorkspace(teamId),
  };
}
