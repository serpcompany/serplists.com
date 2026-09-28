import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createSingleFlight } from '@/features/teams/singleFlight';
import {
  createInviteLink,
  reissueInviteLink,
  visibleInviteLink,
  type AssignableTeamRole,
  type InviteLink,
  type PendingInviteConflict,
} from '@/features/teams/teamInviteLinks';
import { api } from '@/lib/api';

const inviteApi = {
  createInvite: (teamId: string, payload: { email: string; role: AssignableTeamRole }) =>
    api.createTeamInvite(teamId, payload),
  reissueInvite: (teamId: string, inviteId: string, payload: { role?: AssignableTeamRole }) =>
    api.reissueTeamInviteLink(teamId, inviteId, payload),
};

/**
 * Pending invites for the active Organization and the actions a manager takes
 * on them. Actions throw on failure so the screen can report it; create and
 * new-link requests run one at a time, so a double click cannot replace a
 * link twice and leave a dead one on screen.
 */
export function useTeamInvites(activeTeamId: string | null | undefined, canManageTeam: boolean) {
  const queryClient = useQueryClient();
  const [link, setLink] = useState<InviteLink | null>(null);
  const [conflict, setConflict] = useState<PendingInviteConflict | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [reissuingInviteId, setReissuingInviteId] = useState<string | null>(null);
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null);
  const [linkOnce] = useState(createSingleFlight);

  const invitesQuery = useQuery({
    queryKey: ['team-invites', activeTeamId],
    queryFn: () => api.getTeamInvites(activeTeamId as string),
    enabled: Boolean(activeTeamId && canManageTeam),
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    setLink(null);
    setConflict(null);
  }, [activeTeamId]);

  // refetch joins a first load still in flight, which predates the change; cancel it first.
  const reload = async (queryKey: unknown[]) => {
    await queryClient.cancelQueries({ queryKey });
    await queryClient.refetchQueries({ queryKey });
  };
  const reloadInvitesAndActivity = async (teamId: string) => {
    await reload(['team-invites', teamId]);
    await reload(['team-activity', teamId]);
  };

  const createInvite = (teamId: string, email: string, role: AssignableTeamRole) =>
    linkOnce(async () => {
      setIsCreating(true);
      try {
        const result = await createInviteLink(inviteApi, teamId, { email, role });
        if (result.kind === 'created') {
          setLink(result.link);
          setConflict(null);
          await reloadInvitesAndActivity(teamId);
        } else {
          setConflict(result.conflict);
        }
        return result;
      } finally {
        setIsCreating(false);
      }
    });

  const reissueLink = (teamId: string, inviteId: string, role?: AssignableTeamRole) =>
    linkOnce(async () => {
      setReissuingInviteId(inviteId);
      try {
        const nextLink = await reissueInviteLink(inviteApi, teamId, inviteId, role);
        setLink(nextLink);
        setConflict(null);
        await reloadInvitesAndActivity(teamId);
        return nextLink;
      } finally {
        setReissuingInviteId(null);
      }
    });

  const revokeInvite = async (teamId: string, inviteId: string) => {
    setRevokingInviteId(inviteId);
    try {
      await api.revokeTeamInvite(teamId, inviteId);
      await reloadInvitesAndActivity(teamId);
    } finally {
      setRevokingInviteId(null);
    }
  };

  return {
    invites: invitesQuery.data ?? [],
    isLoadingInvites: invitesQuery.isLoading,
    link: visibleInviteLink(link, activeTeamId),
    conflict: conflict && conflict.teamId === activeTeamId ? conflict : null,
    dismissConflict: () => setConflict(null),
    isCreating,
    reissuingInviteId,
    revokingInviteId,
    createInvite,
    reissueLink,
    revokeInvite,
  };
}
