export const PERSONAL_WORKSPACE_ID = 'personal';

// What the provider remembers between renders, per tab. localStorage is shared by every tab,
// so it only seeds a tab's context: it is read once per signed-in user, never on a refetch.
// Otherwise a Personal tab would follow whatever Organization another tab stored, and new
// Templates and Runs would go to that Organization.
export type WorkspaceSelectionMemory = {
  // The user the stored context was read for.
  userId: string | null;
  // The stored Organization this tab still has to restore once the teams query lists it.
  // Cleared by the first successful teams load and by any selection in this tab.
  pendingRestoreId: string | null;
  // A team this tab selected itself that the teams query may not list yet (just created or
  // just joined). It is kept while the query catches up.
  explicitSelectionId: string | null;
};

export const createWorkspaceSelectionMemory = (): WorkspaceSelectionMemory => ({
  userId: null,
  pendingRestoreId: null,
  explicitSelectionId: null,
});

export type WorkspaceSelectionInput = {
  activeWorkspaceId: string;
  readStoredWorkspaceId: () => string;
  userId: string;
  teamIds: readonly string[];
  // The teams query is neither loading nor fetching.
  teamsSettled: boolean;
  // The teams query has succeeded.
  teamsLoaded: boolean;
};

// Returns the context this tab should be in for a signed-in user.
export function reconcileWorkspaceSelection(
  memory: WorkspaceSelectionMemory,
  input: WorkspaceSelectionInput,
): string {
  const { activeWorkspaceId, teamIds } = input;

  if (memory.userId !== input.userId) {
    const storedWorkspaceId = input.readStoredWorkspaceId();
    memory.userId = input.userId;
    memory.pendingRestoreId = storedWorkspaceId === PERSONAL_WORKSPACE_ID ? null : storedWorkspaceId;
  }

  const pendingRestoreId = memory.pendingRestoreId;
  // Once the teams query has answered, the stored context has been honored or ruled out.
  if (input.teamsLoaded) {
    memory.pendingRestoreId = null;
  }

  // The tab fell back to Personal before its stored Organization could be confirmed (for
  // example, the first teams load failed); restore it once teams list it.
  if (
    activeWorkspaceId === PERSONAL_WORKSPACE_ID &&
    pendingRestoreId !== null &&
    teamIds.includes(pendingRestoreId)
  ) {
    memory.pendingRestoreId = null;
    return pendingRestoreId;
  }

  if (activeWorkspaceId !== PERSONAL_WORKSPACE_ID && teamIds.includes(activeWorkspaceId)) {
    memory.explicitSelectionId = null;
    return activeWorkspaceId;
  }

  // The active Organization is not one of the user's teams once the query has settled:
  // membership removed, or the stored id is stale. Fall back without writing storage.
  if (
    activeWorkspaceId !== PERSONAL_WORKSPACE_ID &&
    input.teamsSettled &&
    memory.explicitSelectionId !== activeWorkspaceId
  ) {
    return PERSONAL_WORKSPACE_ID;
  }

  return activeWorkspaceId;
}

// selectWorkspace in this tab. An explicit choice is never overridden by a stored one.
export function recordWorkspaceSelection(memory: WorkspaceSelectionMemory, workspaceId: string): void {
  memory.pendingRestoreId = null;
  memory.explicitSelectionId = workspaceId === PERSONAL_WORKSPACE_ID ? null : workspaceId;
}

// Sign-out: the next user who signs in on this tab starts from the stored context.
export function resetWorkspaceSelection(memory: WorkspaceSelectionMemory): void {
  memory.userId = null;
  memory.pendingRestoreId = null;
  memory.explicitSelectionId = null;
}
