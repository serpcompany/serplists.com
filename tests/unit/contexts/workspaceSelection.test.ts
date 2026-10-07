import { describe, expect, it } from 'vitest';

import {
  PERSONAL_WORKSPACE_ID,
  WORKSPACE_NOT_READY_MESSAGE,
  assertWorkspaceReady,
  createWorkspaceSelectionMemory,
  describeTeamsQuery,
  getRouteOrganizationStatus,
  getWorkspaceStatus,
  isConfirmedSignOut,
  reconcileWorkspaceSelection,
  recordWorkspaceSelection,
  resetWorkspaceSelection,
  toConsoleContext,
  type WorkspaceSelectionInput,
} from '@/contexts/workspaceSelection';
import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';

function createTabAsWorkspaceProviderDrivesIt(options: { stored: string; userId?: string }) {
  const storageSharedByEveryTab = { value: options.stored };
  const memory = createWorkspaceSelectionMemory();
  const tab = {
    storage: storageSharedByEveryTab,
    active: options.stored,
    render(overrides: Partial<WorkspaceSelectionInput> = {}) {
      tab.active = reconcileWorkspaceSelection(memory, {
        activeWorkspaceId: tab.active,
        readStoredWorkspaceId: () => storageSharedByEveryTab.value,
        userId: options.userId ?? 'user-1',
        teamIds: ['acme'],
        teamsSettled: true,
        teamsLoaded: true,
        ...overrides,
      });
      return tab.active;
    },
    renderWhileTheTeamsRefetchOnFocus() {
      return tab.render({ teamsSettled: false });
    },
    storeFromAnotherTab(workspaceId: string) {
      storageSharedByEveryTab.value = workspaceId;
    },
    select(workspaceId: string) {
      recordWorkspaceSelection(memory, workspaceId);
      tab.active = workspaceId;
      storageSharedByEveryTab.value = workspaceId;
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
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: PERSONAL_WORKSPACE_ID });
    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);

    tab.storeFromAnotherTab('acme');
    tab.renderWhileTheTeamsRefetchOnFocus();
    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('keeps an explicit Personal choice after the stored Organization was restored', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });
    expect(tab.render()).toBe('acme');

    tab.select(PERSONAL_WORKSPACE_ID);
    tab.storeFromAnotherTab('acme');
    tab.renderWhileTheTeamsRefetchOnFocus();
    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('keeps the stored Organization when the first teams load fails, which says nothing about membership, until a load succeeds', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });
    expect(tab.render({ teamIds: [], teamsLoaded: false })).toBe('acme');
    expect(tab.render({ teamIds: [], teamsLoaded: false })).toBe('acme');

    expect(tab.render()).toBe('acme');
  });

  it('keeps the stored Organization while the teams request is paused offline', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: false })).toBe('acme');
  });

  it('keeps the stored Organization while a refetch runs over a list that lacks it', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: true })).toBe('acme');
    expect(tab.render({ teamIds: ['acme'] })).toBe('acme');
  });

  it('starts a tab that signs in from the stored Organization, not from Personal', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });
    tab.active = PERSONAL_WORKSPACE_ID;

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: false })).toBe('acme');
    expect(tab.render()).toBe('acme');
  });

  it('keeps the stored Organization when the last teams request failed over an older list that lacks it, which cannot rule it out', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });

    expect(tab.render({ teamIds: ['joined'], teamsFailed: true })).toBe('acme');
    expect(tab.render({ teamIds: ['joined', 'acme'] })).toBe('acme');
  });

  it('keeps the stored Organization while teams are still loading', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });

    expect(tab.render({ teamIds: [], teamsSettled: false, teamsLoaded: false })).toBe('acme');
    expect(tab.render()).toBe('acme');
  });

  it('falls back to Personal when the stored Organization is not one of the user\'s', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'gone' });

    expect(tab.render()).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('stays in Personal when a later refetch lists that Organization, such as after an invite accepted in another tab', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'gone' });
    tab.render();

    expect(tab.render({ teamIds: ['acme', 'gone'] })).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('keeps a team this tab just created until the teams query lists it', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: PERSONAL_WORKSPACE_ID });
    tab.render();

    tab.select('new-team');
    expect(tab.render({ teamsSettled: true })).toBe('new-team');
    expect(tab.render({ teamIds: ['acme', 'new-team'] })).toBe('new-team');
  });

  it('falls back to Personal when this tab loses its Organization membership', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme' });
    tab.render();

    expect(tab.render({ teamIds: [] })).toBe(PERSONAL_WORKSPACE_ID);
  });

  it('restores the stored Organization for the next user who signs in on the tab', () => {
    const tab = createTabAsWorkspaceProviderDrivesIt({ stored: 'acme', userId: 'user-1' });
    tab.render();
    tab.select(PERSONAL_WORKSPACE_ID);
    tab.signOut();
    tab.storeFromAnotherTab('bravo');

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
  });

  it('is ready in Personal even when the teams request failed, since Personal never waits on it', () => {
    expect(getWorkspaceStatus({ ...base, activeWorkspaceId: PERSONAL_WORKSPACE_ID, teamsFailed: true })).toBe('ready');
  });

  it('is loading while the Organization is not confirmed yet', () => {
    expect(getWorkspaceStatus(base)).toBe('loading');
  });

  it('is an error when the teams request failed before the Organization was confirmed', () => {
    expect(getWorkspaceStatus({ ...base, teamsFailed: true })).toBe('error');
  });

  it('stays ready when a background refetch fails over a list that has the Organization', () => {
    expect(getWorkspaceStatus({ ...base, teamIds: ['acme'], teamsFailed: true })).toBe('ready');
  });
});

describe('assertWorkspaceReady', () => {
  it('lets a write through only once the context is ready', () => {
    expect(() => assertWorkspaceReady('ready')).not.toThrow();
    expect(() => assertWorkspaceReady('loading')).toThrow(WORKSPACE_NOT_READY_MESSAGE);
    expect(() => assertWorkspaceReady('error')).toThrow(WORKSPACE_NOT_READY_MESSAGE);
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
  it('forgets the stored Organization only when the server confirmed there is no session, never while get-session is unavailable and the user may still be signed in', () => {
    expect(isConfirmedSignOut('unauthenticated')).toBe(true);
    expect(isConfirmedSignOut('unavailable')).toBe(false);
    expect(isConfirmedSignOut('loading')).toBe(false);
  });
});

describe('getRouteOrganizationStatus, which decides what an Organization URL shows', () => {
  const settledList = { teamIds: ['acme'], teamsLoaded: true, teamsSettled: true, teamsFailed: false };

  it('confirms an Organization the user belongs to', () => {
    expect(getRouteOrganizationStatus({ ...settledList, organizationId: 'acme' })).toBe('confirmed');
  });

  it('confirms an Organization the tab just created or joined, before the server lists it', () => {
    expect(
      getRouteOrganizationStatus({ organizationId: 'acme', teamIds: ['acme'], teamsLoaded: false, teamsSettled: false, teamsFailed: true }),
    ).toBe('confirmed');
  });

  it('calls an Organization missing only once a settled list from the server leaves it out', () => {
    expect(getRouteOrganizationStatus({ ...settledList, organizationId: 'archived-or-unknown' })).toBe('missing');
  });

  it('waits while the list loads, refetches, is paused offline or failed, since none of those rules it out', () => {
    const unknown = { organizationId: 'other' };
    expect(getRouteOrganizationStatus({ ...settledList, ...unknown, teamsLoaded: false, teamsSettled: false })).toBe('pending');
    expect(getRouteOrganizationStatus({ ...settledList, ...unknown, teamsSettled: false })).toBe('pending');
    expect(getRouteOrganizationStatus({ ...settledList, ...unknown, teamsLoaded: false })).toBe('pending');
    expect(getRouteOrganizationStatus({ ...settledList, ...unknown, teamsFailed: true })).toBe('pending');
  });

  it('never reads the Personal id in an Organization URL as Personal', () => {
    expect(
      getRouteOrganizationStatus({ ...settledList, organizationId: PERSONAL_WORKSPACE_ID, teamsLoaded: false, teamsSettled: false }),
    ).toBe('missing');
  });
});

describe('toConsoleContext', () => {
  it('names the console context of a workspace id', () => {
    expect(toConsoleContext(PERSONAL_WORKSPACE_ID)).toEqual(PERSONAL_CONSOLE);
    expect(toConsoleContext('acme')).toEqual(organizationConsole('acme'));
  });
});
