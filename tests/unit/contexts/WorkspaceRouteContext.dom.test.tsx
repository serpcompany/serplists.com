import { navigation } from '../../support/mockedNextNavigation';
import { teamsApi } from '../../support/signedInTeamsApi';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';
import { organizationConsole, PERSONAL_CONSOLE } from '@/lib/consoleRoutes';
import { registerLeaveGuard } from '@/lib/navigation/leaveGuard';

import { deferred } from '../../support/deferred';
import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { renderTheWorkspaceProvider, type ShownWorkspace } from '../../support/workspaceProviderProbe';

const { getTeams } = teamsApi;

theInMemoryBrowserAsTheWindow();

const REMEMBERED_CONTEXT_KEY = 'serplists.activeWorkspaceId';

const organization = (id: string, name: string): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name,
  role: 'owner',
});

const acme = organization('team-1', 'Acme');
const beta = organization('team-2', 'Beta');

let unmountTheTab: () => void = () => {};

beforeEach(() => {
  getTeams.mockReset();
  getTeams.mockResolvedValue([acme, beta]);
});

afterEach(() => unmountTheTab());

async function openTheTabAt(url: string, { remembered = 'personal' }: { remembered?: string } = {}) {
  navigation.reset(url);
  navigation.window.localStorage.setItem(REMEMBERED_CONTEXT_KEY, remembered);
  const tab = renderTheWorkspaceProvider();
  unmountTheTab = tab.unmount;
  await letQueryUpdatesReachObservers();
  return tab.workspace;
}

const remembered = () => navigation.window.localStorage.getItem(REMEMBERED_CONTEXT_KEY);

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

  it('leaves a Personal URL in the context the tab remembered, since links there come from every context until they follow the route', async () => {
    const workspace = await openTheTabAt('/dashboard/templates/', { remembered: 'team-1' });

    expect(workspace().routeOrganizationStatus).toBeNull();
    expect(workspace().activeTeamId).toBe('team-1');
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
