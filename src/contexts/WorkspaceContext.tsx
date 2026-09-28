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
import { api, type TeamRole, type TeamSummary } from '@/lib/api';

import {
  PERSONAL_WORKSPACE_ID,
  createWorkspaceSelectionMemory,
  isConfirmedSignOut,
  reconcileWorkspaceSelection,
  recordWorkspaceSelection,
  resetWorkspaceSelection,
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
  isTeamWorkspace: boolean;
  isWorkspaceLoading: boolean;
  refreshTeams: () => Promise<TeamSummary[]>;
  rememberTeam: (team: TeamSummary) => void;
  selectWorkspace: (workspaceId: string) => void;
  teams: TeamSummary[];
  workspaces: Workspace[];
  workspaceScopeId: string;
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

const canRoleEditTemplates = (role: TeamRole): boolean =>
  role === 'owner' || role === 'admin' || role === 'editor';

const canRoleRunTemplates = (role: TeamRole): boolean =>
  canRoleEditTemplates(role) || role === 'runner';

const canRoleManageTeam = (role: TeamRole): boolean =>
  role === 'owner' || role === 'admin';

const readStoredWorkspaceId = (): string => {
  if (typeof window === 'undefined') {
    return PERSONAL_WORKSPACE_ID;
  }

  try {
    return (
      window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY) ||
      PERSONAL_WORKSPACE_ID
    );
  } catch {
    return PERSONAL_WORKSPACE_ID;
  }
};

const writeStoredWorkspaceId = (workspaceId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspaceId);
  } catch {
    // Ignore local storage failures; the in-memory workspace still updates.
  }
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
      teamsSettled: !teamsQuery.isLoading && !teamsQuery.isFetching,
      teamsLoaded: teamsQuery.isSuccess,
    });
    if (nextWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(nextWorkspaceId);
    }
  }, [
    activeWorkspaceId,
    isAuthLoading,
    sessionStatus,
    teams,
    teamsQuery.isFetching,
    teamsQuery.isLoading,
    teamsQuery.isSuccess,
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

      recordWorkspaceSelection(selectionMemoryRef.current, nextWorkspaceId);
      setActiveWorkspaceId(nextWorkspaceId);
      writeStoredWorkspaceId(nextWorkspaceId);
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
    [queryClient],
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

  const isWorkspaceLoading = isAuthLoading || teamsQuery.isLoading;

  // Memoized so a background teams refetch (isFetching toggles on window focus) does not
  // re-render every consumer.
  const value = useMemo<WorkspaceContextValue>(() => {
    const isTeamWorkspace = activeWorkspace.type === 'team';
    const teamRole = isTeamWorkspace ? activeWorkspace.role : undefined;
    return {
      activeTeamId: isTeamWorkspace ? activeWorkspace.teamId : undefined,
      activeWorkspace,
      activeWorkspaceId: activeWorkspace.id,
      canEditTemplates: teamRole ? canRoleEditTemplates(teamRole) : true,
      canManageTeam: teamRole ? canRoleManageTeam(teamRole) : false,
      canRunTemplates: teamRole ? canRoleRunTemplates(teamRole) : true,
      createTeam,
      isTeamWorkspace,
      isWorkspaceLoading,
      refreshTeams,
      rememberTeam,
      selectWorkspace,
      teams,
      workspaces,
      workspaceScopeId: activeWorkspace.id,
    };
  }, [activeWorkspace, createTeam, isWorkspaceLoading, refreshTeams, rememberTeam, selectWorkspace, teams, workspaces]);

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
