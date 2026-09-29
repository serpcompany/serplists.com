import { describe, expect, it } from 'vitest';

import {
  PERSONAL_WORKSPACE_ID,
  createWorkspaceSelectionMemory,
  describeTeamsQuery,
  getWorkspaceStatus,
  isConfirmedSignOut,
  reconcileWorkspaceSelection,
  recordWorkspaceSelection,
  resetWorkspaceSelection,
  type WorkspaceSelectionInput,
} from '@/contexts/workspaceSelection';

// Drives the selection the way WorkspaceProvider's effect does: once per render, with the
// tab's current context, the teams query state, and localStorage (shared by every tab).
function createTab(options: { stored: string; userId?: string }) {
  const storage = { value: options.stored };
  const memory = createWorkspaceSelectionMemory();
  const tab = {
    storage,
    // A new tab starts from the stored context.
    active: options.stored,
    render(overrides: Partial<WorkspaceSelectionInput> = {}) {
      tab.active = reconcileWorkspaceSelection(memory, {
        activeWorkspaceId: tab.active,
        readStoredWorkspaceId: () => storage.value,
        userId: options.userId ?? 'user-1',
        teamIds: ['acme'],
        teamsSettled: true,
        teamsLoaded: true,
        ...overrides,
      });
      return tab.active;
    },
    select(workspaceId: string) {
      recordWorkspaceSelection(memory, workspaceId);
      tab.active = workspaceId;
      storage.value = workspaceId;
    },
    signOut() {
      resetWorkspaceSelection(memory);
      tab.active = PERSONAL_WORKSPACE_ID;
    },
  };
  return tab;
}

describe('workspace selection', () => {
  it('keeps a Personal tab Personal when another tab stores an Organization and teams refetch', () => {
    const tab = createTab({ stored: PERSONAL_WORKSPACE_ID });
    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);

    // Another tab selects Acme; this tab refetches teams when it gets focus again.
    tab.storage.value = 'acme';
    tab.render({ teamsSettled: false });
    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('keeps an explicit Personal choice after the stored Organization was restored', () => {
    const tab = createTab({ stored: 'acme' });
    expect(tab.render()).toBe('acme');

    tab.select(PERSONAL_WORKSPACE_ID);
    tab.storage.value = 'acme';
    tab.render({ teamsSettled: false });
    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);
  });

  // A failed teams request says nothing about membership. Falling back to Personal made
  // Organization users create Templates and Runs in Personal, then jump back later.
  it('keeps the stored Organization when the first teams load fails, until a load succeeds', () => {
    const tab = createTab({ stored: 'acme' });
    expect(tab.render({ teamIds: [], teamsLoaded: false })).toBe('acme');
    expect(tab.render({ teamIds: [], teamsLoaded: false })).toBe('acme');

    expect(tab.render()).toBe('acme');
  });

  it('keeps the stored Organization while the teams request is paused offline', () => {
    const tab = createTab({ stored: 'acme' });

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: false })).toBe('acme');
  });

  it('keeps the stored Organization while a refetch runs over a list that lacks it', () => {
    const tab = createTab({ stored: 'acme' });

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: true })).toBe('acme');
    expect(tab.render({ teamIds: ['acme'] })).toBe('acme');
  });

  it('starts a tab that signs in from the stored Organization, not from Personal', () => {
    const tab = createTab({ stored: 'acme' });
    tab.active = PERSONAL_WORKSPACE_ID;

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: false })).toBe('acme');
    expect(tab.render()).toBe('acme');
  });

  // A failed request leaves its older list in place (or one the app wrote itself), so that
  // list cannot rule the stored Organization out.
  it('keeps the stored Organization when the last teams request failed over a list that lacks it', () => {
    const tab = createTab({ stored: 'acme' });

    expect(tab.render({ teamIds: ['joined'], teamsFailed: true })).toBe('acme');
    expect(tab.render({ teamIds: ['joined', 'acme'] })).toBe('acme');
  });

  it('keeps the stored Organization while teams are still loading', () => {
    const tab = createTab({ stored: 'acme' });

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: false })).toBe('acme');
    expect(tab.render()).toBe('acme');
  });

  it('falls back to Personal for good when the stored Organization is not one of the user\'s', () => {
    const tab = createTab({ stored: 'gone' });
    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);

    // A later refetch that lists it (for example after an invite in another tab) does not move the tab.
    expect(tab.render({ teamIds: ['acme', 'gone'] })).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('keeps a team this tab just created until the teams query lists it', () => {
    const tab = createTab({ stored: PERSONAL_WORKSPACE_ID });
    tab.render();

    tab.select('new-team');
    expect(tab.render({ teamsSettled: true })).toBe('new-team');
    expect(tab.render({ teamIds: ['acme', 'new-team'] })).toBe('new-team');
  });

  it('falls back to Personal when this tab loses its Organization membership', () => {
    const tab = createTab({ stored: 'acme' });
    tab.render();

    expect(tab.render({ teamIds: [] })).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('restores the stored Organization for the next user who signs in on the tab', () => {
    const tab = createTab({ stored: 'acme', userId: 'user-1' });
    tab.render();
    tab.select(PERSONAL_WORKSPACE_ID);
    tab.signOut();
    tab.storage.value = 'bravo';

    const next = reconcileWorkspaceSelection(createWorkspaceSelectionMemory(), {
      activeWorkspaceId: tab.active,
      readStoredWorkspaceId: () => tab.storage.value,
      userId: 'user-2',
      teamIds: ['bravo'],
      teamsSettled: true,
      teamsLoaded: true,
    });
    expect(next).toBe('bravo');
  });
});

describe('getWorkspaceStatus', () => {
  const base = { hasUser: true, activeWorkspaceId: 'acme', teamIds: [] as string[], teamsFailed: false };

  it('is ready in Personal, in a listed Organization, and when signed out', () => {
    expect(getWorkspaceStatus({ ...base, activeWorkspaceId: PERSONAL_WORKSPACE_ID })).toBe('ready');
    expect(getWorkspaceStatus({ ...base, teamIds: ['acme'] })).toBe('ready');
    expect(getWorkspaceStatus({ ...base, hasUser: false, teamsFailed: true })).toBe('ready');
    // A Personal user never waits on, or fails with, the teams request.
    expect(getWorkspaceStatus({ ...base, activeWorkspaceId: PERSONAL_WORKSPACE_ID, teamsFailed: true })).toBe('ready');
  });

  it('is loading while the Organization is not confirmed yet', () => {
    expect(getWorkspaceStatus(base)).toBe('loading');
  });

  it('is an error when the teams request failed before the Organization was confirmed', () => {
    expect(getWorkspaceStatus({ ...base, teamsFailed: true })).toBe('error');
    // A failed background refetch over a list that has it changes nothing.
    expect(getWorkspaceStatus({ ...base, teamIds: ['acme'], teamsFailed: true })).toBe('ready');
  });
});

describe('describeTeamsQuery', () => {
  it('treats a failed or paused first load as neither loaded nor failed membership', () => {
    expect(describeTeamsQuery({ data: undefined, fetchStatus: 'idle', isError: true })).toEqual({
      teamsLoaded: false,
      teamsSettled: true,
      teamsFailed: true,
    });
    expect(describeTeamsQuery({ data: undefined, fetchStatus: 'paused', isError: false })).toEqual({
      teamsLoaded: false,
      teamsSettled: false,
      teamsFailed: false,
    });
  });

  it('is settled only when no request is in flight or paused', () => {
    expect(describeTeamsQuery({ data: [], fetchStatus: 'idle', isError: false })).toEqual({
      teamsLoaded: true,
      teamsSettled: true,
      teamsFailed: false,
    });
    expect(describeTeamsQuery({ data: [], fetchStatus: 'fetching', isError: false }).teamsSettled).toBe(false);
  });
});

describe('isConfirmedSignOut', () => {
  it('forgets the stored Organization only when the server confirmed there is no session', () => {
    expect(isConfirmedSignOut('unauthenticated')).toBe(true);
    // A 503, 429 or dropped connection on get-session: the user may still be signed in.
    expect(isConfirmedSignOut('unavailable')).toBe(false);
    expect(isConfirmedSignOut('loading')).toBe(false);
  });
});
