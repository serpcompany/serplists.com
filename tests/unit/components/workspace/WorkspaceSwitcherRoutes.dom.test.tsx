import { navigation } from '../../../support/mockedNextNavigation';
import { teamsApi } from '../../../support/signedInTeamsApi';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SidebarProvider } from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import type { TeamSummary } from '@/lib/api';

import { letQueryUpdatesReachObservers } from '../../../support/queryNotifications';
import { openTheMenu, theInMemoryBrowserAsTheWindow } from '../../../support/renderInTheDom';
import { renderTheWorkspaceProvider } from '../../../support/workspaceProviderProbe';

const { getTeams } = teamsApi;

theInMemoryBrowserAsTheWindow();

const acme: TeamSummary = { id: 'team-1', memberId: 'member-1', membershipStatus: 'active', name: 'Acme', role: 'editor' };

let unmountTheSwitcher: () => void = () => {};

beforeEach(() => {
  getTeams.mockReset();
  getTeams.mockResolvedValue([acme]);
});

afterEach(() => unmountTheSwitcher());

async function openTheSwitcherAt(url: string, remembered = 'personal') {
  navigation.reset(url);
  navigation.window.localStorage.setItem('serplists.activeWorkspaceId', remembered);
  await act(async () => {
    ({ unmount: unmountTheSwitcher } = renderTheWorkspaceProvider(
      <SidebarProvider>
        <WorkspaceSwitcher />
      </SidebarProvider>,
    ));
  });
  await letQueryUpdatesReachObservers();
  await openTheMenu('Switch context');
}

const theSwitcher = () => screen.getByRole('button', { name: 'Switch context' });
const organizationProfileLink = () => screen.queryByRole('menuitem', { name: 'View Organization profile' });

const choose = (name: RegExp) =>
  act(async () => {
    fireEvent.click(screen.getByRole('menuitem', { name }));
  });

describe('the context switcher on Personal URLs', () => {
  it('names Personal whatever the tab remembered, and links Settings to Personal settings', async () => {
    await openTheSwitcherAt('/dashboard/runs/', 'team-1');

    expect(theSwitcher().textContent).toContain('Personal');
    expect(theSwitcher().textContent).not.toContain('Acme');
    expect(screen.getByRole('menuitem', { name: 'Settings' }).getAttribute('href')).toBe('/dashboard/settings/');
    expect(organizationProfileLink()).toBeNull();
  });
});

describe('the context switcher on Organization URLs', () => {
  it("links the active Organization's public profile at its handle, as soon as that Organization is chosen", async () => {
    getTeams.mockResolvedValue([{ ...acme, slug: 'Acme-Launch' }]);
    await openTheSwitcherAt('/dashboard/templates/');
    expect(organizationProfileLink()).toBeNull();

    await choose(/Acme/);
    await letQueryUpdatesReachObservers();
    await openTheMenu('Switch context');

    expect(organizationProfileLink()?.getAttribute('href')).toBe('/profile/Acme-Launch/');
  });

  it('offers no profile link for an Organization without a handle, which has no public profile', async () => {
    await openTheSwitcherAt('/dashboard/organization/team-1/templates/');

    expect(theSwitcher().textContent).toContain('Acme');
    expect(organizationProfileLink()).toBeNull();
  });

  it("names the Organization the URL names and links Settings to that Organization's settings", async () => {
    await openTheSwitcherAt('/dashboard/organization/team-1/runs/run-1/');

    expect(theSwitcher().textContent).toContain('Acme');
    expect(screen.getByRole('menuitem', { name: 'Settings' }).getAttribute('href')).toBe(
      '/dashboard/organization/team-1/settings/',
    );
  });

  it('opens the same section in Personal when Personal is chosen', async () => {
    await openTheSwitcherAt('/dashboard/organization/team-1/runs/run-1/');

    await choose(/Personal/);
    await letQueryUpdatesReachObservers();

    expect(navigation.url()).toBe('/dashboard/runs/');
    expect(theSwitcher().textContent).toContain('Personal');
  });

  it("opens the Organization's section when it is chosen from a Personal page", async () => {
    await openTheSwitcherAt('/dashboard/archive/');

    await choose(/Acme/);
    await letQueryUpdatesReachObservers();

    expect(navigation.url()).toBe('/dashboard/organization/team-1/archive/');
    expect(theSwitcher().textContent).toContain('Acme');
  });

  it("stays usable on an Organization the user cannot open, naming the tab's own context and leaving for it", async () => {
    await openTheSwitcherAt('/dashboard/organization/team-9/templates/');

    expect(theSwitcher().textContent).toContain('Personal');
    expect(theSwitcher().textContent).not.toContain('Loading');
    expect(screen.getByRole('menuitem', { name: 'Settings' }).getAttribute('href')).toBe('/dashboard/settings/');

    await choose(/Personal/);

    expect(navigation.url()).toBe('/dashboard/templates/');
  });
});
