import { navigation } from '../../support/mockedNextNavigation';
import React from 'react';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import OrganizationSettings from '@/views/OrganizationSettings';
import { renderSettled, theInMemoryBrowserAsTheWindow } from '../../support/renderInTheDom';

const ORGANIZATION = { id: 'team-1', name: 'Acme', role: 'admin', type: 'team' };
const workspace = vi.hoisted(() => ({ activeWorkspace: { id: 'team-1', name: 'Acme', role: 'admin', type: 'team' } }));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspace,
}));
vi.mock('@/components/account/BillingSection', () => ({ BillingSection: () => <h2>Acme billing</h2> }));
vi.mock('@/components/account/TeamSettingsSection', () => ({ TeamSettingsSection: () => <h2>Members</h2> }));
vi.mock('@/components/account/LeaveOrganizationCard', () => ({ LeaveOrganizationCard: () => <h2>Leave</h2> }));

theInMemoryBrowserAsTheWindow();
afterEach(() => {
  cleanup();
  workspace.activeWorkspace = ORGANIZATION;
});

const openTheSettingsAt = async (origin: string) => {
  navigation.reset(`${origin}/dashboard/organization/team-1/settings/`);
  await renderSettled(<OrganizationSettings />);
  return document.body.textContent;
};

describe("Organization Settings' pointer to the User's own controls", () => {
  it('names Run Keys among the Account Settings where Run Keys are on', async () => {
    const page = await openTheSettingsAt('http://localhost');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Acme Settings');
    expect(page).toContain("Acme's billing, members and invites.");
    expect(page).toContain('Your profile, security and Run Keys are in Account Settings.');
  });

  it('leaves Run Keys out where they are off', async () => {
    const page = await openTheSettingsAt('https://serplists.com');

    expect(page).toContain('Your profile and security are in Account Settings.');
    expect(page).not.toContain('Run Keys');
  });
});

describe('Organization Settings outside an Organization', () => {
  it('shows nothing while Personal is the active context', async () => {
    workspace.activeWorkspace = { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' };

    const page = await openTheSettingsAt('http://localhost');

    expect(page).toBe('');
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
