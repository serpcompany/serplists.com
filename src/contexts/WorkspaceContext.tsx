import { createContext, useContext } from 'react';

import type { TeamRole, TeamSummary } from '@/lib/api';
import type { ConsoleContext } from '@/lib/consoleRoutes';
import type { ResourcePermissions } from '@/lib/organizationPermissions';

import type { PERSONAL_WORKSPACE_ID, RouteOrganizationStatus, WorkspaceStatus } from './workspaceSelection';

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
      slug?: string | null | undefined;
    };

export type CreateTeamInput = {
  name: string;
  slug?: string | undefined;
};

export type WorkspaceContextValue = {
  activeTeamId?: string | undefined;
  activeWorkspace: Workspace;
  activeWorkspaceId: string;
  canEditTemplates: boolean;
  canManageTeam: boolean;
  canRunTemplates: boolean;
  consoleContext: ConsoleContext;
  createTeam: (input: CreateTeamInput) => Promise<void>;
  getPermissions: (teamId?: string) => ResourcePermissions;
  isRoleUnavailable: (teamId?: string) => boolean;
  isTeamWorkspace: boolean;
  isWorkspaceLoading: boolean;
  patchTeam: (teamId: string, patch: Partial<Omit<TeamSummary, 'id'>>) => void;
  refreshTeams: () => Promise<TeamSummary[]>;
  rememberTeam: (team: TeamSummary) => void;
  retryWorkspace: () => void;
  routeOrganizationStatus: RouteOrganizationStatus | null;
  selectWorkspace: (workspaceId: string) => void;
  teams: TeamSummary[];
  teamsUnavailable: boolean;
  workspaces: Workspace[];
  workspaceScopeId: string;
  workspaceStatus: WorkspaceStatus;
};

export const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(
  undefined,
);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
