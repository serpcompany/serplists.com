import '../../support/mockedNextNavigation';
import { teamSettingsServer as server } from '../../support/signedInTeamSettingsApi';
import React from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TeamSummary } from '@/lib/api';

import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { oneWorkspaceTabPerTest, organizationSummary } from '../../support/workspaceTab';

import { LeaveOrganizationCard } from '@/components/account/LeaveOrganizationCard';
import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';

theInMemoryBrowserAsTheWindow();
const openTheTabAt = oneWorkspaceTabPerTest();

const acmeAdmin: TeamSummary = { ...organizationSummary('team-1', 'Acme'), role: 'admin' };

const openTheSettingsAt = (url: string) =>
  openTheTabAt(url, {
    page: (
      <>
        <TeamSettingsSection />
        <LeaveOrganizationCard />
      </>
    ),
    remembered: 'team-1',
  });

const organizationManagement = () => [
  screen.queryByText(/^Your role:/),
  screen.queryByRole('button', { name: 'Save Organization' }),
  screen.queryByLabelText('Invite email'),
  screen.queryByRole('button', { name: 'Leave Organization' }),
];

beforeEach(() => {
  server.getTeams.mockReset().mockResolvedValue([acmeAdmin]);
  server.getIncomingTeamInvites.mockReset().mockResolvedValue([]);
});

describe('Settings in each context', () => {
  it("shows the account's Organization choices on Personal settings, and no Organization's management, whatever the tab remembered", async () => {
    await openTheSettingsAt('/dashboard/settings/');

    expect(organizationManagement()).toEqual([null, null, null, null]);
    expect(screen.getByRole('button', { name: 'Create Organization' })).toBeTruthy();
    expect(screen.getByText('Your Organizations')).toBeTruthy();
    expect(screen.getByText('Create or select an Organization to share templates and runs.')).toBeTruthy();
  });

  it("manages the Organization on that Organization's settings", async () => {
    await openTheSettingsAt('/dashboard/organization/team-1/settings/');

    expect(screen.getByText('Your role: Admin')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Organization' })).toBeTruthy();
    expect(screen.getByLabelText('Invite email')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave Organization' })).toBeTruthy();
  });
});
