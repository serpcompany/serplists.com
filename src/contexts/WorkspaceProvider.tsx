import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { patchTeamSummary } from '@/features/teams/teamSummaries';
import { api, type TeamSummary } from '@/lib/api';
import { safeLocalStorage } from '@/lib/browserStorage';
import { getOrganizationPermissions, getResourcePermissions } from '@/lib/organizationPermissions';

import { SESSION_RECHECK_INTERVAL_MS } from './sessionSync';
import {
  WorkspaceContext,
  type CreateTeamInput,
  type Workspace,
  type WorkspaceContextValue,
} from './WorkspaceContext';
import { markListsStaleForWorkspaceSwitch } from './templateListCache';
import {
  PERSONAL_WORKSPACE_ID,
  createWorkspaceSelectionMemory,
  describeTeamsQuery,
  getWorkspaceStatus,
  isConfirmedSignOut,
  reconcileWorkspaceSelection,
  recordWorkspaceSelection,
  resetWorkspaceSelection,
} from './workspaceSelection';

const ACTIVE_WORKSPACE_STORAGE_KEY = 'serplists.activeWorkspaceId';

const personalWorkspace: Workspace = {
  id: PERSONAL_WORKSPACE_ID,
  name: 'Personal',
  role: 'owner',
  type: 'personal',
};

const readStoredWorkspaceId = (): string =>
  safeLocalStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) || PERSONAL_WORKSPACE_ID;

const writeStoredWorkspaceId = (workspaceId: string): void => {
  safeLocalStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
};

function useRememberedTeams(
  userId: string | undefined,
  teamsList: { dataUpdatedAt: number; isSuccess: boolean },
) {
  const [rememberedTeams, setRememberedTeams] = useState<TeamSummary[]>([]);
  const { dataUpdatedAt: teamsUpdatedAt, isSuccess: teamsSucceeded } = teamsList;
  const [seenTeamsList, setSeenTeamsList] = useState({ userId, teamsUpdatedAt, teamsSucceeded });
  if (
    seenTeamsList.userId !== userId ||
    seenTeamsList.teamsUpdatedAt !== teamsUpdatedAt ||
    seenTeamsList.teamsSucceeded !== teamsSucceeded
  ) {
    setSeenTeamsList({ userId, teamsUpdatedAt, teamsSucceeded });
    if (seenTeamsList.userId !== userId || teamsSucceeded) {
      setRememberedTeams((currentTeams) =>
        currentTeams.length === 0 ? currentTeams : [],
      );
    }
  }
  return [rememberedTeams, setRememberedTeams] as const;
}

export function WorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading: isAuthLoading, sessionStatus, user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    readStoredWorkspaceId,
  );
  const selectionMemoryRef = useRef(createWorkspaceSelectionMemory());

  const teamsQuery = useQuery({
    queryKey: ['teams', userId],
    queryFn: () => api.getTeams(),
    enabled: Boolean(user),
    staleTime: SESSION_RECHECK_INTERVAL_MS,
  });
  const [rememberedTeams, setRememberedTeams] = useRememberedTeams(userId, teamsQuery);

  const queriedTeams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const { teamsFailed, teamsLoaded, teamsSettled } = describeTeamsQuery(teamsQuery);
  const teamsUnavailable = teamsFailed && !teamsLoaded;

  const teams = useMemo(() => {
    const mergedTeams = new Map<string, TeamSummary>();

    for (const team of rememberedTeams) {
      mergedTeams.set(team.id, team);
    }

    for (const team of queriedTeams) {
      mergedTeams.set(team.id, team);
    }

    return Array.from(mergedTeams.values());
  }, [rememberedTeams, queriedTeams]);

  const workspaces = useMemo<Workspace[]>(
    () => [
      personalWorkspace,
      ...teams.map((team) => ({
        id: team.id,
        memberId: team.memberId,
        name: team.name,
        role: team.role,
        slug: team.slug,
        teamId: team.id,
        type: 'team' as const,
      })),
    ],
    [teams],
  );

  const signedOut = !isAuthLoading && !user && isConfirmedSignOut(sessionStatus);
  const [seenSignedOut, setSeenSignedOut] = useState(false);
  if (seenSignedOut !== signedOut) {
    setSeenSignedOut(signedOut);
    if (signedOut) {
      setSelectedWorkspaceId(PERSONAL_WORKSPACE_ID);
    }
  }

  useEffect(() => {
    if (!signedOut) {
      return;
    }
    resetWorkspaceSelection(selectionMemoryRef.current);
    writeStoredWorkspaceId(PERSONAL_WORKSPACE_ID);
  }, [signedOut]);

  useEffect(() => {
    if (isAuthLoading || !user) {
      return;
    }

    const nextWorkspaceId = reconcileWorkspaceSelection(selectionMemoryRef.current, {
      activeWorkspaceId: selectedWorkspaceId,
      readStoredWorkspaceId,
      userId: user.id,
      teamIds: teams.map((team) => team.id),
      teamsSettled,
      teamsLoaded,
      teamsFailed,
    });
    if (nextWorkspaceId !== selectedWorkspaceId) {
      setSelectedWorkspaceId(nextWorkspaceId);
    }
  }, [
    isAuthLoading,
    selectedWorkspaceId,
    teams,
    teamsFailed,
    teamsLoaded,
    teamsSettled,
    user,
  ]);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      personalWorkspace,
    [selectedWorkspaceId, workspaces],
  );

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      const nextWorkspaceId = workspaceId || PERSONAL_WORKSPACE_ID;

      recordWorkspaceSelection(selectionMemoryRef.current, nextWorkspaceId);
      setSelectedWorkspaceId(nextWorkspaceId);
      writeStoredWorkspaceId(nextWorkspaceId);
      markListsStaleForWorkspaceSwitch(queryClient, {
        fromWorkspaceId: selectedWorkspaceId,
        toWorkspaceId: nextWorkspaceId,
      });
    },
    [queryClient, selectedWorkspaceId],
  );

  const rememberTeam = useCallback(
    (team: TeamSummary) => {
      setRememberedTeams((currentTeams) => [
        team,
        ...currentTeams.filter((currentTeam) => currentTeam.id !== team.id),
      ]);

      if (userId) {
        void queryClient.cancelQueries({ queryKey: ['teams', userId], exact: true });
        queryClient.setQueryData<TeamSummary[]>(['teams', userId], (currentTeams) =>
          currentTeams
            ? [team, ...currentTeams.filter((currentTeam) => currentTeam.id !== team.id)]
            : currentTeams,
        );
      }
    },
    [queryClient, setRememberedTeams, userId],
  );

  const patchTeam = useCallback(
    (teamId: string, patch: Partial<Omit<TeamSummary, 'id'>>) => {
      setRememberedTeams((currentTeams) => patchTeamSummary(currentTeams, teamId, patch));

      if (userId) {
        queryClient.setQueryData<TeamSummary[]>(['teams', userId], (currentTeams) =>
          currentTeams ? patchTeamSummary(currentTeams, teamId, patch) : currentTeams,
        );
      }
    },
    [queryClient, setRememberedTeams, userId],
  );

  const refreshTeams = useCallback(async () => {
    if (!userId) {
      return [];
    }

    await queryClient.cancelQueries({ queryKey: ['teams', userId], exact: true });
    return queryClient.fetchQuery({
      queryKey: ['teams', userId],
      queryFn: () => api.getTeams(),
      staleTime: 0,
    });
  }, [queryClient, userId]);

  const createTeam = useCallback(
    async (input: CreateTeamInput) => {
      const createdTeam = await api.createTeam(input);
      rememberTeam(createdTeam);
      selectWorkspace(createdTeam.id);
      void refreshTeams().catch(() => undefined);
    },
    [rememberTeam, refreshTeams, selectWorkspace],
  );

  const workspaceStatus = getWorkspaceStatus({
    hasUser: Boolean(user),
    activeWorkspaceId: selectedWorkspaceId,
    teamIds: teams.map((team) => team.id),
    teamsFailed,
  });
  const isWorkspaceLoading = isAuthLoading || teamsQuery.isLoading || workspaceStatus !== 'ready';
  const { refetch: refetchTeams } = teamsQuery;
  const retryWorkspace = useCallback(() => {
    void refetchTeams();
  }, [refetchTeams]);
  const getPermissions = useCallback(
    (teamId?: string) =>
      getResourcePermissions(teamId, (id) => teams.find((team) => team.id === id)?.role),
    [teams],
  );
  const isRoleUnavailable = useCallback(
    (teamId?: string) =>
      Boolean(teamId) && teamsUnavailable && !teams.some((team) => team.id === teamId),
    [teams, teamsUnavailable],
  );

  const value = useMemo<WorkspaceContextValue>(() => {
    const isTeamWorkspace = activeWorkspace.type === 'team';
    const teamRole = isTeamWorkspace ? activeWorkspace.role : undefined;
    const activePermissions = getOrganizationPermissions(teamRole);
    return {
      activeTeamId: isTeamWorkspace ? activeWorkspace.teamId : undefined,
      activeWorkspace,
      activeWorkspaceId: activeWorkspace.id,
      canEditTemplates: teamRole ? activePermissions.canEditTemplates : true,
      canManageTeam: teamRole ? activePermissions.canManage : false,
      canRunTemplates: teamRole ? activePermissions.canRun : true,
      createTeam,
      getPermissions,
      isRoleUnavailable,
      isTeamWorkspace,
      isWorkspaceLoading,
      patchTeam,
      refreshTeams,
      rememberTeam,
      retryWorkspace,
      selectWorkspace,
      teams,
      teamsUnavailable,
      workspaces,
      workspaceScopeId: activeWorkspace.id,
      workspaceStatus,
    };
  }, [
    activeWorkspace, createTeam, getPermissions, isRoleUnavailable, isWorkspaceLoading, patchTeam, refreshTeams,
    rememberTeam, retryWorkspace, selectWorkspace, teams, teamsUnavailable, workspaces, workspaceStatus,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
