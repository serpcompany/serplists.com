import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/contexts/CloudflareAuthContext';
import { patchTeamSummary } from '@/features/teams/teamSummaries';
import { api, type TeamRole, type TeamSummary } from '@/lib/api';
import { safeLocalStorage } from '@/lib/browserStorage';
import {
  getOrganizationPermissions,
  getResourcePermissions,
  type ResourcePermissions,
} from '@/lib/organizationPermissions';

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
  type WorkspaceStatus,
} from './workspaceSelection';

const ACTIVE_WORKSPACE_STORAGE_KEY = 'serplists.activeWorkspaceId';

export type Workspace =
  | {
      id: typeof PERSONAL_WORKSPACE_ID;
      type: 'personal';
      name: string;
      role: 'owner';
    }
  | {
      id: string;
      type: 'team';
      name: string;
      role: TeamRole;
      teamId: string;
      memberId: string;
      slug?: string | null;
    };

type CreateTeamInput = {
  name: string;
  slug?: string;
};

type WorkspaceContextValue = {
  activeTeamId?: string;
  activeWorkspace: Workspace;
  activeWorkspaceId: string;
  canEditTemplates: boolean;
  canManageTeam: boolean;
  canRunTemplates: boolean;
  createTeam: (input: CreateTeamInput) => Promise<void>;
  // Permissions on a resource owned by this Organization (Personal when teamId is empty),
  // from the user's role there, whichever context is active.
  getPermissions: (teamId?: string) => ResourcePermissions;
  isTeamWorkspace: boolean;
  // True until the session and the active context are known, including while the stored
  // Organization is unconfirmed ('loading' or 'error' status). Lists wait for it.
  isWorkspaceLoading: boolean;
  /** Applies a confirmed change to one cached Organization without refetching. */
  patchTeam: (teamId: string, patch: Partial<Omit<TeamSummary, 'id'>>) => void;
  refreshTeams: () => Promise<TeamSummary[]>;
  rememberTeam: (team: TeamSummary) => void;
  // Retries the teams request after it failed ('error' status).
  retryWorkspace: () => void;
  selectWorkspace: (workspaceId: string) => void;
  teams: TeamSummary[];
  workspaces: Workspace[];
  workspaceScopeId: string;
  // 'loading' or 'error' while the stored Organization is not confirmed by the teams query.
  // The context then falls back to Personal only for display: never write to it.
  workspaceStatus: WorkspaceStatus;
};

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

const personalWorkspace: Workspace = {
  id: PERSONAL_WORKSPACE_ID,
  name: 'Personal',
  role: 'owner',
  type: 'personal',
};

const readStoredWorkspaceId = (): string =>
  safeLocalStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) || PERSONAL_WORKSPACE_ID;

// safeLocalStorage never throws; when storage is blocked the choice lasts for the session.
const writeStoredWorkspaceId = (workspaceId: string): void => {
  safeLocalStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
};

export function WorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading: isAuthLoading, sessionStatus, user } = useAuth();
  const queryClient = useQueryClient();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    readStoredWorkspaceId,
  );
  const [optimisticTeams, setOptimisticTeams] = useState<TeamSummary[]>([]);
  const selectionMemoryRef = useRef(createWorkspaceSelectionMemory());

  const teamsQuery = useQuery({
    queryKey: ['teams', user?.id],
    queryFn: () => api.getTeams(),
    enabled: Boolean(user),
    staleTime: 60 * 1000,
  });

  const queriedTeams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const { teamsFailed, teamsLoaded, teamsSettled } = describeTeamsQuery(teamsQuery);

  const teams = useMemo(() => {
    const mergedTeams = new Map<string, TeamSummary>();

    for (const team of optimisticTeams) {
      mergedTeams.set(team.id, team);
    }

    for (const team of queriedTeams) {
      mergedTeams.set(team.id, team);
    }

    return Array.from(mergedTeams.values());
  }, [optimisticTeams, queriedTeams]);

  useEffect(() => {
    setOptimisticTeams((currentTeams) =>
      currentTeams.length === 0 ? currentTeams : [],
    );
  }, [user?.id]);

  useEffect(() => {
    if (teamsQuery.isSuccess) {
      setOptimisticTeams((currentTeams) =>
        currentTeams.length === 0 ? currentTeams : [],
      );
    }
  }, [teamsQuery.dataUpdatedAt, teamsQuery.isSuccess]);

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

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!user) {
      // Forget the stored context only on a confirmed sign-out. When the session check failed
      // the user may still be signed in, so keep it for when the session comes back.
      if (!isConfirmedSignOut(sessionStatus)) {
        return;
      }
      resetWorkspaceSelection(selectionMemoryRef.current);
      setOptimisticTeams((currentTeams) =>
        currentTeams.length === 0 ? currentTeams : [],
      );
      setActiveWorkspaceId(PERSONAL_WORKSPACE_ID);
      writeStoredWorkspaceId(PERSONAL_WORKSPACE_ID);
      return;
    }

    // See workspaceSelection.ts: storage seeds the tab once per user, so a teams refetch never
    // moves this tab to an Organization another tab stored.
    const nextWorkspaceId = reconcileWorkspaceSelection(selectionMemoryRef.current, {
      activeWorkspaceId,
      readStoredWorkspaceId,
      userId: user.id,
      teamIds: teams.map((team) => team.id),
      teamsSettled,
      teamsLoaded,
    });
    if (nextWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(nextWorkspaceId);
    }
  }, [
    activeWorkspaceId,
    isAuthLoading,
    sessionStatus,
    teams,
    teamsLoaded,
    teamsSettled,
    user,
  ]);

  const activeWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId) ??
      personalWorkspace,
    [activeWorkspaceId, workspaces],
  );

  const selectWorkspace = useCallback(
    (workspaceId: string) => {
      const nextWorkspaceId = workspaceId || PERSONAL_WORKSPACE_ID;

      // Recorded and stored even when unchanged: createTeam and invite acceptance rely on
      // the explicit selection while the teams query catches up.
      recordWorkspaceSelection(selectionMemoryRef.current, nextWorkspaceId);
      setActiveWorkspaceId(nextWorkspaceId);
      writeStoredWorkspaceId(nextWorkspaceId);
      // Compared with the raw state, which may hold a stored Organization that still resolves
      // to Personal. Lists are only marked stale (see templateListCache.ts).
      markListsStaleForWorkspaceSwitch(queryClient, {
        fromWorkspaceId: activeWorkspaceId,
        toWorkspaceId: nextWorkspaceId,
      });
    },
    [activeWorkspaceId, queryClient],
  );

  const rememberTeam = useCallback(
    (team: TeamSummary) => {
      setOptimisticTeams((currentTeams) => [
        team,
        ...currentTeams.filter((currentTeam) => currentTeam.id !== team.id),
      ]);

      if (user?.id) {
        queryClient.setQueryData<TeamSummary[]>(
          ['teams', user.id],
          (currentTeams = []) => [
            team,
            ...currentTeams.filter((currentTeam) => currentTeam.id !== team.id),
          ],
        );
      }
    },
    [queryClient, user?.id],
  );

  const patchTeam = useCallback(
    (teamId: string, patch: Partial<Omit<TeamSummary, 'id'>>) => {
      setOptimisticTeams((currentTeams) => patchTeamSummary(currentTeams, teamId, patch));

      if (user?.id) {
        queryClient.setQueryData<TeamSummary[]>(['teams', user.id], (currentTeams) =>
          currentTeams ? patchTeamSummary(currentTeams, teamId, patch) : currentTeams,
        );
      }
    },
    [queryClient, user?.id],
  );

  const refreshTeams = useCallback(async () => {
    if (!user?.id) {
      return [];
    }

    return queryClient.fetchQuery({
      queryKey: ['teams', user.id],
      queryFn: () => api.getTeams(),
      staleTime: 0,
    });
  }, [queryClient, user?.id]);

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
    activeWorkspaceId,
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

  // Memoized so a background teams refetch (isFetching toggles on window focus) does not
  // re-render every consumer.
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
      isTeamWorkspace,
      isWorkspaceLoading,
      patchTeam,
      refreshTeams,
      rememberTeam,
      retryWorkspace,
      selectWorkspace,
      teams,
      workspaces,
      workspaceScopeId: activeWorkspace.id,
      workspaceStatus,
    };
  }, [
    activeWorkspace, createTeam, getPermissions, isWorkspaceLoading, patchTeam, refreshTeams, rememberTeam,
    retryWorkspace, selectWorkspace, teams, workspaces, workspaceStatus,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
