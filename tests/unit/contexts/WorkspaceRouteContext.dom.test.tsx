import { navigation } from '../../support/mockedNextNavigation';
import { teamsApi } from '../../support/signedInTeamsApi';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';
import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import { registerLeaveGuard } from '@/lib/navigation/leaveGuard';

import { deferred } from '../../support/deferred';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import {
  oneWorkspaceTabPerTest,
  organizationSummary,
  rememberedContext as remembered,
  type ShownWorkspace,
} from '../../support/workspaceTab';

const { getTeams } = teamsApi;

theInMemoryBrowserAsTheWindow();
const openTheTabAt = oneWorkspaceTabPerTest();

const acme = organizationSummary('team-1', 'Acme');
const beta = organizationSummary('team-2', 'Beta');

beforeEach(() => {
  getTeams.mockReset();
  getTeams.mockResolvedValue([acme, beta]);
});

async function switchTo(workspace: () => ShownWorkspace, workspaceId: string) {
  act(() => workspace().selectWorkspace(workspaceId));
  await letQueryUpdatesReachObservers();
}

describe('an Organization URL decides the context', () => {
  it('shows the Organization it names, whatever the tab remembered, and becomes the remembered context', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-2/templates/', { remembered: 'team-1' });

    expect(workspace().routeOrganizationStatus).toBe('confirmed');
    expect(workspace().workspaceStatus).toBe('ready');
    expect(workspace().activeTeamId).toBe('team-2');
    expect(workspace().workspaceScopeId).toBe('team-2');
    expect(workspace().consoleContext).toEqual(organizationConsole('team-2'));
    expect(remembered()).toBe('team-2');
  });

  it('shows none of the Organization while the list that confirms it loads', async () => {
    const teams = deferred<TeamSummary[]>();
    getTeams.mockReturnValue(teams.promise);
    const workspace = await openTheTabAt('/dashboard/organization/team-1/runs/');

    expect(workspace().routeOrganizationStatus).toBe('pending');
    expect(workspace().workspaceStatus).toBe('loading');
    expect(workspace().activeTeamId).toBeUndefined();
    expect(workspace().consoleContext).toEqual(organizationConsole('team-1'));

    teams.resolve([acme]);
    await letQueryUpdatesReachObservers();

    expect(workspace().routeOrganizationStatus).toBe('confirmed');
    expect(workspace().activeTeamId).toBe('team-1');
  });

  it('calls an unknown, archived or inaccessible Organization missing, keeps the tab in its own context, and remembers nothing of it', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-9/templates/', { remembered: 'team-1' });

    expect(workspace().routeOrganizationStatus).toBe('missing');
    expect(workspace().activeTeamId).toBe('team-1');
    expect(workspace().consoleContext).toEqual(organizationConsole('team-1'));
    expect(workspace().workspaceStatus).toBe('ready');
    expect(remembered()).toBe('team-1');
  });

  it('shows the Organizations error, never Personal, when the list that would confirm it fails', async () => {
    getTeams.mockRejectedValue(new Error('Teams unavailable'));
    const workspace = await openTheTabAt('/dashboard/organization/team-1/templates/');

    expect(workspace().routeOrganizationStatus).toBe('pending');
    expect(workspace().workspaceStatus).toBe('error');
    expect(workspace().activeTeamId).toBeUndefined();
  });

  it('names no remembered Organization for links outside the console until the list confirms it, since a settled list may rule it out', async () => {
    const teams = deferred<TeamSummary[]>();
    getTeams.mockReturnValue(teams.promise);
    const workspace = await openTheTabAt('/profile/serp/ultimate-camping-checklist/', { remembered: 'team-1' });

    expect(workspace().consoleContext).toEqual(PERSONAL_CONSOLE);

    teams.resolve([acme]);
    await letQueryUpdatesReachObservers();

    expect(workspace().consoleContext).toEqual(organizationConsole('team-1'));
  });
});

describe('a Personal URL always means Personal', () => {
  it.each(['/dashboard/templates/', '/dashboard/runs/run-1/', '/dashboard/settings/', '/dashboard/archive/'])(
    'shows Personal at %s whatever the tab remembered, and becomes the remembered context',
    async (url) => {
      const workspace = await openTheTabAt(url, { remembered: 'team-1' });

      expect(workspace().routeOrganizationStatus).toBeNull();
      expect(workspace().activeWorkspace.type).toBe('personal');
      expect(workspace().activeTeamId).toBeUndefined();
      expect(workspace().workspaceScopeId).toBe('personal');
      expect(workspace().consoleContext).toEqual(PERSONAL_CONSOLE);
      expect(remembered()).toBe('personal');
    },
  );

  it('shows Personal while the Organizations list loads, and when it fails, never the remembered Organization', async () => {
    const teams = deferred<TeamSummary[]>();
    getTeams.mockReturnValue(teams.promise);
    const workspace = await openTheTabAt('/dashboard/templates/', { remembered: 'team-1' });

    expect(workspace().workspaceStatus).toBe('ready');
    expect(workspace().activeTeamId).toBeUndefined();

    teams.reject(new Error('Teams unavailable'));
    await letQueryUpdatesReachObservers();

    expect(workspace().workspaceStatus).toBe('ready');
    expect(workspace().activeTeamId).toBeUndefined();
    expect(workspace().teamsUnavailable).toBe(true);
  });

  it('shows Personal at a Personal URL opened after an Organization URL, and a page outside the console then keeps Personal', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-1/templates/');
    expect(workspace().activeTeamId).toBe('team-1');

    act(() => {
      navigation.router.push('/dashboard/runs/');
    });
    await letQueryUpdatesReachObservers();
    expect(workspace().activeWorkspace.type).toBe('personal');
    expect(remembered()).toBe('personal');

    act(() => {
      navigation.router.push('/profile/serp/ultimate-camping-checklist/');
    });
    await letQueryUpdatesReachObservers();
    expect(workspace().activeWorkspace.type).toBe('personal');
  });

  it("keeps the tab's last Organization on a page outside the console", async () => {
    const workspace = await openTheTabAt('/dashboard/runs/');

    act(() => {
      navigation.router.push('/dashboard/organization/team-2/runs/');
    });
    await letQueryUpdatesReachObservers();
    act(() => {
      navigation.router.push('/team-invites/token-1/');
    });
    await letQueryUpdatesReachObservers();

    expect(workspace().activeTeamId).toBe('team-2');
    expect(remembered()).toBe('team-2');
  });
});

describe('switching context on a console page opens the same section in the other context', () => {
  it('goes from an Organization Run to the Personal Runs list, in Personal', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-1/runs/run-1/');

    await switchTo(workspace, 'personal');

    expect(navigation.url()).toBe('/dashboard/runs/');
    expect(workspace().activeWorkspace.type).toBe('personal');
    expect(workspace().consoleContext).toEqual(PERSONAL_CONSOLE);
    expect(remembered()).toBe('personal');
  });

  it('keeps the switch to Personal while the Organization page is still shown, before the navigation lands', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-1/runs/');
    let destination = '';
    vi.mocked(navigation.router.push).mockImplementationOnce((href: string) => {
      destination = href;
    });

    await switchTo(workspace, 'personal');
    expect(workspace().activeTeamId).toBe('team-1');

    act(() => {
      navigation.router.push(destination);
    });
    await letQueryUpdatesReachObservers();

    expect(navigation.url()).toBe('/dashboard/runs/');
    expect(workspace().activeWorkspace.type).toBe('personal');
    expect(remembered()).toBe('personal');
  });

  it("goes from Personal settings to the Organization's settings, which the tab then follows", async () => {
    const workspace = await openTheTabAt('/dashboard/settings/');

    await switchTo(workspace, 'team-1');

    expect(navigation.url()).toBe('/dashboard/organization/team-1/settings/');
    expect(workspace().activeTeamId).toBe('team-1');
    expect(remembered()).toBe('team-1');
  });

  it('goes from one Organization to another', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-1/archive/');

    await switchTo(workspace, 'team-2');

    expect(navigation.url()).toBe('/dashboard/organization/team-2/archive/');
    expect(workspace().activeTeamId).toBe('team-2');
  });

  it('shows the Organization again when its URL is opened after switching away', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-1/runs/');
    await switchTo(workspace, 'personal');

    act(() => {
      navigation.router.push('/dashboard/organization/team-1/runs/');
    });
    await letQueryUpdatesReachObservers();

    expect(workspace().activeTeamId).toBe('team-1');
  });

  it('stays on the page when the context it shows is chosen again', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-1/runs/run-1/');

    await switchTo(workspace, 'team-1');

    expect(navigation.url()).toBe('/dashboard/organization/team-1/runs/run-1/');
    expect(workspace().activeTeamId).toBe('team-1');
  });

  it("leaves a missing Organization's URL even for the tab's own context", async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-9/templates/');

    await switchTo(workspace, 'personal');

    expect(navigation.url()).toBe('/dashboard/templates/');
  });

  it('changes nothing when the user keeps the unsaved work the page asked about', async () => {
    const workspace = await openTheTabAt('/dashboard/organization/team-1/templates/new/');
    const stopGuarding = registerLeaveGuard({
      message: 'Leave without saving?',
      shouldConfirm: () => true,
      onLeaveConfirmed: () => undefined,
    });
    vi.mocked(navigation.window.confirm).mockReturnValue(false);

    await switchTo(workspace, 'personal');
    stopGuarding();

    expect(navigation.url()).toBe('/dashboard/organization/team-1/templates/new/');
    expect(workspace().activeTeamId).toBe('team-1');
    expect(remembered()).toBe('team-1');
  });

  it('switches in place on a page outside the console, such as a public Template', async () => {
    const workspace = await openTheTabAt('/profile/serp/ultimate-camping-checklist/');

    await switchTo(workspace, 'team-1');

    expect(navigation.url()).toBe('/profile/serp/ultimate-camping-checklist/');
    expect(workspace().activeTeamId).toBe('team-1');
    expect(remembered()).toBe('team-1');
  });
});
