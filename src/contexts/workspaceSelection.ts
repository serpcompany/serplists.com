import { organizationConsole, PERSONAL_CONSOLE, type ConsoleContext } from '@/lib/consoleRoutes';

import type { SessionStatus } from './authSession';

export const PERSONAL_WORKSPACE_ID = 'personal';

export const toConsoleContext = (workspaceId: string): ConsoleContext =>
  workspaceId === PERSONAL_WORKSPACE_ID ? PERSONAL_CONSOLE : organizationConsole(workspaceId);

export type RouteOrganizationStatus = 'confirmed' | 'pending' | 'missing';

export function getRouteOrganizationStatus(input: {
  organizationId: string;
  teamIds: readonly string[];
  teamsLoaded: boolean;
  teamsSettled: boolean;
  teamsFailed: boolean;
}): RouteOrganizationStatus {
  if (input.organizationId === PERSONAL_WORKSPACE_ID) return 'missing';
  if (input.teamIds.includes(input.organizationId)) return 'confirmed';
  return input.teamsLoaded && input.teamsSettled && !input.teamsFailed ? 'missing' : 'pending';
}

export type WorkspaceSelectionMemory = {
  storedContextReadForUserId: string | null;
  explicitSelectionId: string | null;
};

export const createWorkspaceSelectionMemory = (): WorkspaceSelectionMemory => ({
  storedContextReadForUserId: null,
  explicitSelectionId: null,
});

export type WorkspaceSelectionInput = {
  activeWorkspaceId: string;
  readStoredWorkspaceId: () => string;
  userId: string;
  teamIds: readonly string[];
  teamsSettled: boolean;
  teamsLoaded: boolean;
  teamsFailed?: boolean;
};

export function reconcileWorkspaceSelection(
  memory: WorkspaceSelectionMemory,
  input: WorkspaceSelectionInput,
): string {
  const { teamIds } = input;
  let activeWorkspaceId = input.activeWorkspaceId;

  if (memory.storedContextReadForUserId !== input.userId) {
    const storedWorkspaceId = input.readStoredWorkspaceId();
    memory.storedContextReadForUserId = input.userId;
    if (activeWorkspaceId === PERSONAL_WORKSPACE_ID) {
      activeWorkspaceId = storedWorkspaceId;
    }
  }

  if (activeWorkspaceId === PERSONAL_WORKSPACE_ID) {
    return activeWorkspaceId;
  }

  if (teamIds.includes(activeWorkspaceId)) {
    memory.explicitSelectionId = null;
    return activeWorkspaceId;
  }

  if (
    input.teamsLoaded &&
    input.teamsSettled &&
    !input.teamsFailed &&
    memory.explicitSelectionId !== activeWorkspaceId
  ) {
    return PERSONAL_WORKSPACE_ID;
  }

  return activeWorkspaceId;
}

export type WorkspaceStatus = 'ready' | 'loading' | 'error';

export const WORKSPACE_NOT_READY_MESSAGE =
  "Your Organizations haven't loaded yet, so this can't be saved. Try again in a moment.";

export function assertWorkspaceReady(status: WorkspaceStatus): void {
  if (status === 'loading' || status === 'error') {
    throw new Error(WORKSPACE_NOT_READY_MESSAGE);
  }
}

export function getWorkspaceStatus(input: {
  hasUser: boolean;
  activeWorkspaceId: string;
  teamIds: readonly string[];
  teamsFailed: boolean;
}): WorkspaceStatus {
  if (
    !input.hasUser ||
    input.activeWorkspaceId === PERSONAL_WORKSPACE_ID ||
    input.teamIds.includes(input.activeWorkspaceId)
  ) {
    return 'ready';
  }
  return input.teamsFailed ? 'error' : 'loading';
}

export function describeTeamsQuery(query: {
  data: unknown;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isError: boolean;
}): { teamsLoaded: boolean; teamsSettled: boolean; teamsFailed: boolean } {
  return {
    teamsLoaded: query.data !== undefined,
    teamsSettled: query.fetchStatus === 'idle',
    teamsFailed: query.isError,
  };
}

export function recordWorkspaceSelection(memory: WorkspaceSelectionMemory, workspaceId: string): void {
  memory.explicitSelectionId = workspaceId === PERSONAL_WORKSPACE_ID ? null : workspaceId;
}

export function resetWorkspaceSelection(memory: WorkspaceSelectionMemory): void {
  memory.storedContextReadForUserId = null;
  memory.explicitSelectionId = null;
}

export function isConfirmedSignOut(sessionStatus: SessionStatus): boolean {
  return sessionStatus === 'unauthenticated';
}
