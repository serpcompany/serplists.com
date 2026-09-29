import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useWorkspace } from '@/contexts/WorkspaceContext';
import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';
import { createSingleFlight } from '@/features/teams/singleFlight';
import { api } from '@/lib/api';
import { queryKindPrefix } from '@/lib/queryKeys';

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

// The preview depends on who asks (only the invited account sees it), so it is
// cached per account: after switching accounts the page never shows the
// previous account's answer.
export const teamInvitePreviewQueryKey = (token: string | undefined, viewerId: string | null) => [
  'team-invite-preview',
  token,
  viewerId,
];

/**
 * State and actions for an invite link page. Opening the page only reads the
 * preview; joining happens when the invitee clicks Accept, and switching the
 * active context is a separate, explicit step. `viewerId` is the signed-in
 * user's id, or null until the session is known.
 */
export function useTeamInviteLink(token: string | undefined, viewerId: string | null) {
  const queryClient = useQueryClient();
  const { refreshTeams, rememberTeam, selectWorkspace } = useWorkspace();
  // Accept and Decline share one guard, so a double click (or clicking both)
  // sends a single request.
  const [respondOnce] = useState(createSingleFlight);

  const refreshIncomingInvites = () =>
    queryClient.invalidateQueries({ queryKey: queryKindPrefix('incomingTeamInvites') });
  // A preview read already under way when the answer lands must not overwrite it: after a
  // decline the invite is revoked, so that read answers 404.
  const stopReadingPreview = (_result: unknown, respondedAs: string | null) =>
    queryClient.cancelQueries({ queryKey: teamInvitePreviewQueryKey(token, respondedAs) });

  // Each answer records the account that gave it (the mutation variable), so another
  // account that signs in on this page sees its own invite, not this answer.
  const acceptMutation = useMutation({
    mutationFn: (_respondedAs: string | null) =>
      respondWithTimeout(
        acceptTeamInviteForWorkspace(token as string, { refreshTeams, rememberTeam }),
      ),
    onSuccess: stopReadingPreview,
    onSettled: refreshIncomingInvites,
  });

  const declineMutation = useMutation({
    mutationFn: (_respondedAs: string | null) =>
      respondWithTimeout(api.declineTeamInvite(token as string)),
    onSuccess: stopReadingPreview,
    onSettled: refreshIncomingInvites,
  });

  const isAccepted = acceptMutation.isSuccess && acceptMutation.variables === viewerId;
  const isDeclined = declineMutation.isSuccess && declineMutation.variables === viewerId;

  // Once this account has answered, the preview is not read again (on focus, reconnect or
  // invalidation): the page keeps the loaded invite for its confirmation. An unanswered
  // invite still rereads on focus, so a revoke or expiry shows up.
  const previewQuery = useQuery({
    queryKey: teamInvitePreviewQueryKey(token, viewerId),
    queryFn: () => api.getTeamInvitePreview(token as string),
    enabled: Boolean(token) && Boolean(viewerId) && !isAccepted && !isDeclined,
    retry: false,
    staleTime: 0,
  });

  return {
    preview: previewQuery.data,
    previewError: previewQuery.error,
    isPreviewLoading: previewQuery.isLoading,
    accept: () => respondOnce(() => acceptMutation.mutateAsync(viewerId)),
    acceptError: acceptMutation.error,
    isAccepted,
    decline: () => respondOnce(() => declineMutation.mutateAsync(viewerId)),
    declineError: declineMutation.error,
    isDeclined,
    isResponding: acceptMutation.isPending || declineMutation.isPending,
    switchToOrganization: (teamId: string) => selectWorkspace(teamId),
  };
}
