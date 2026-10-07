import '../../support/mockedNextNavigation';
import { teamSettingsServer as server } from '../../support/signedInTeamSettingsApi';
import React from 'react';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';

import { theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';
import { oneWorkspaceTabPerTest, organizationSummary } from '../../support/workspaceTab';

vi.mock('@/lib/auth-client', () => ({ authClient: {} }));
vi.mock('@/env', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isPersonalRunMcpUiEnabled: () => true,
}));
vi.mock('@/components/account/AgentAccessSection', () => ({
  AgentAccessSection: () => <h2>Agent Access</h2>,
}));

import SettingsPage from '@/app/(app)/dashboard/settings/page';
import OrganizationLayout from '@/app/(app)/dashboard/organization/[organizationId]/layout';
import OrganizationSettingsPage from '@/app/(app)/dashboard/organization/[organizationId]/settings/page';

theInMemoryBrowserAsTheWindow();
const openTheTabAt = oneWorkspaceTabPerTest();

const acmeAdmin: TeamSummary = { ...organizationSummary('team-1', 'Acme'), role: 'admin' };

const heading = (name: string) => screen.queryByRole('heading', { name });

const accountControls = () => ['Profile Information', 'Security', 'Agent Access', 'Personal billing'].map(heading);

const accountOrganizationChoices = () => [
  screen.queryByRole('button', { name: 'Create Organization' }),
  screen.queryByText('Your Organizations'),
];

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
  it("is Account Settings at the Personal URL, whatever the tab remembered: the User's own controls, Personal billing and Organization choices, and no Organization's management", async () => {
    await openTheTabAt('/dashboard/settings/', { page: <SettingsPage />, remembered: 'team-1' });

    expect(heading('Account Settings')).toBeTruthy();
    expect(accountControls().every(Boolean)).toBe(true);
    expect(accountOrganizationChoices().every(Boolean)).toBe(true);
    expect(organizationManagement()).toEqual([null, null, null, null]);
    expect(heading('Acme billing')).toBeNull();
  });

  it("is the Organization's own page at its URL, named after it, with its billing and management and none of the User's Account controls", async () => {
    await openTheTabAt('/dashboard/organization/team-1/settings/', {
      page: (
        <OrganizationLayout>
          <OrganizationSettingsPage />
        </OrganizationLayout>
      ),
    });

    expect(heading('Acme Settings')).toBeTruthy();
    expect(heading('Acme billing')).toBeTruthy();
    expect(heading('Acme')).toBeTruthy();
    expect(organizationManagement().every(Boolean)).toBe(true);
    expect(screen.getByText('Your role: Admin')).toBeTruthy();
    expect(accountControls()).toEqual([null, null, null, null]);
    expect(accountOrganizationChoices()).toEqual([null, null]);
    expect(screen.getByRole('link', { name: 'Account Settings' }).getAttribute('href')).toBe('/dashboard/settings/');
  });
});
