import type { SessionStatus } from './authSession';

export const PERSONAL_WORKSPACE_ID = 'personal';

// What the provider remembers between renders, per tab. localStorage is shared by every tab,
// so it only seeds a tab's context: it is read once per signed-in user, never on a refetch.
// Otherwise a Personal tab would follow whatever Organization another tab stored, and new
// Templates and Runs would go to that Organization.
export type WorkspaceSelectionMemory = {
  // The user the stored context was read for.
  userId: string | null;
  // A team this tab selected itself that the teams query may not list yet (just created or
  // just joined). It is kept while the query catches up.
  explicitSelectionId: string | null;
};

export const createWorkspaceSelectionMemory = (): WorkspaceSelectionMemory => ({
  userId: null,
  explicitSelectionId: null,
});

export type WorkspaceSelectionInput = {
  activeWorkspaceId: string;
  readStoredWorkspaceId: () => string;
  userId: string;
  teamIds: readonly string[];
  // No teams request is in flight or paused (offline).
  teamsSettled: boolean;
  // The teams query holds a list from the server.
  teamsLoaded: boolean;
};

// Returns the context this tab should be in for a signed-in user.
export function reconcileWorkspaceSelection(
  memory: WorkspaceSelectionMemory,
  input: WorkspaceSelectionInput,
): string {
  const { teamIds } = input;
  let activeWorkspaceId = input.activeWorkspaceId;

  // A tab that signs in starts from the stored context. It stays unresolved (see
  // getWorkspaceStatus) until the teams query confirms or rules out the Organization.
  if (memory.userId !== input.userId) {
    const storedWorkspaceId = input.readStoredWorkspaceId();
    memory.userId = input.userId;
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

  // Fall back to Personal (without writing storage) only when a settled teams list from the
  // server leaves the Organization out: membership removed, or a stale stored id. A failed,
  // paused or running request says nothing about membership, so the tab keeps the
  // Organization and the context reports 'loading' or 'error' instead of acting in Personal.
  if (
    input.teamsLoaded &&
    input.teamsSettled &&
    memory.explicitSelectionId !== activeWorkspaceId
  ) {
    return PERSONAL_WORKSPACE_ID;
  }

  return activeWorkspaceId;
}

export type WorkspaceStatus = 'ready' | 'loading' | 'error';

export const WORKSPACE_NOT_READY_MESSAGE =
  "Your Organizations haven't loaded yet, so this can't be saved. Try again in a moment.";

// Throws for a write that would go to the active context before that context is known.
// Mocked contexts in tests may omit the status, which counts as known.
export function assertWorkspaceReady(status: WorkspaceStatus | undefined): void {
  if (status === 'loading' || status === 'error') {
    throw new Error(WORKSPACE_NOT_READY_MESSAGE);
  }
}

// Whether the active context is known. While it is not, lists stay disabled and writes that
// would go to the active context are refused, so nothing lands in Personal by mistake.
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

// Reads the teams query the way the selection needs it. React Query leaves `isLoading` and
// `isFetching` false both after a failed first load and while a request is paused offline,
// so neither means the list was confirmed.
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

// selectWorkspace in this tab. An explicit choice is never overridden by a stored one.
export function recordWorkspaceSelection(memory: WorkspaceSelectionMemory, workspaceId: string): void {
  memory.explicitSelectionId = workspaceId === PERSONAL_WORKSPACE_ID ? null : workspaceId;
}

// Sign-out: the next user who signs in on this tab starts from the stored context.
export function resetWorkspaceSelection(memory: WorkspaceSelectionMemory): void {
  memory.userId = null;
  memory.explicitSelectionId = null;
}

// With no user, reset the tab to Personal and store Personal only when the server confirmed
// there is no session. A failed session check ('unavailable') must not wipe the stored
// Organization: the user is often still signed in and would come back in Personal.
export function isConfirmedSignOut(sessionStatus: SessionStatus): boolean {
  return sessionStatus === 'unauthenticated';
}
