import '../../support/mockedNextNavigation';
import { teamSettingsServer as server } from '../../support/signedInTeamSettingsApi';
import React, { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { AccountOrganizationsSection } from '@/components/account/AccountOrganizationsSection';
import type { IncomingTeamInvite, TeamSummary } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

import { createTestQueryClient } from '../../fixtures/queryClient';
import { deferred } from '../../support/deferred';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';

const workspace = vi.hoisted(() => ({
  createTeam: vi.fn(),
  selectWorkspace: vi.fn(),
  teams: [] as TeamSummary[],
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    createTeam: workspace.createTeam,
    refreshTeams: vi.fn(),
    rememberTeam: vi.fn(),
    retryWorkspace: vi.fn(),
    selectWorkspace: workspace.selectWorkspace,
    teams: workspace.teams,
    teamsUnavailable: false,
  }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const acme: TeamSummary = { id: 'team-1', memberId: 'member-1', membershipStatus: 'active', name: 'Acme', role: 'admin' };

const openOrganizations = () =>
  renderSettled(
    <QueryClientProvider client={createTestQueryClient()}>
      <AccountOrganizationsSection />
    </QueryClientProvider>,
  );

const submitTheNewOrganization = async (name: string, slug = '') => {
  await typeInto(inputNamed('Organization name'), name);
  await typeInto(inputNamed('Slug'), slug);
  await act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Create Organization' }).closest('form') ?? document.body);
  });
};

beforeEach(() => {
  server.getIncomingTeamInvites.mockResolvedValue([]);
  workspace.teams = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('creating an Organization from Account Settings', () => {
  it('creates it with the trimmed name and slug, says so while creating, and clears the form', async () => {
    const creating = deferred<void>();
    workspace.createTeam.mockReturnValue(creating.promise);
    await openOrganizations();

    await submitTheNewOrganization(' Acme Group ', ' acme-group ');
    expect(screen.getByRole('button', { name: 'Creating...' }).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      creating.resolve();
    });

    expect(workspace.createTeam).toHaveBeenCalledWith({ name: 'Acme Group', slug: 'acme-group' });
    expect(toast.success).toHaveBeenCalledWith('Organization created');
    expect([inputNamed('Organization name').value, inputNamed('Slug').value]).toEqual(['', '']);
  });

  it('lets the server choose the slug when none is typed', async () => {
    workspace.createTeam.mockResolvedValue(undefined);
    await openOrganizations();

    await submitTheNewOrganization('Acme Group');

    expect(workspace.createTeam).toHaveBeenCalledWith({ name: 'Acme Group', slug: undefined });
  });

  it('asks for a name before creating anything', async () => {
    await openOrganizations();

    await submitTheNewOrganization('   ');

    expect(toast.error).toHaveBeenCalledWith('Organization name is required');
    expect(workspace.createTeam).not.toHaveBeenCalled();
  });

  it("shows the server's reason and keeps what was typed when it could not be created", async () => {
    workspace.createTeam.mockRejectedValue(new Error('That slug is taken'));
    await openOrganizations();

    await submitTheNewOrganization('Acme Group', 'acme');

    expect(toast.error).toHaveBeenCalledWith('That slug is taken');
    expect(inputNamed('Slug').value).toBe('acme');
  });
});

describe('choosing one of your Organizations', () => {
  it('switches to the Organization chosen', async () => {
    workspace.teams = [acme];
    await openOrganizations();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Acme/ }));
    });

    expect(workspace.selectWorkspace).toHaveBeenCalledWith('team-1');
  });
});

describe('an Organization invite that cannot be accepted', () => {
  it("shows the server's reason and reloads the invites", async () => {
    const invite: IncomingTeamInvite = {
      id: 'invite-1',
      teamId: 'team-2',
      teamName: 'Globex',
      email: 'alice@example.test',
      role: 'editor',
      expiresAt: '2099-01-01T00:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    server.getIncomingTeamInvites.mockResolvedValue([invite]);
    server.acceptIncomingTeamInvite.mockRejectedValue(new ApiError({ status: 410, message: 'This invite has expired' }));
    await openOrganizations();
    await screen.findByText('Globex');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Accept invite to Globex' }));
    });

    expect(toast.error).toHaveBeenCalledWith('This invite has expired');
    expect(server.getIncomingTeamInvites).toHaveBeenCalledTimes(2);
    expect(workspace.selectWorkspace).not.toHaveBeenCalled();
  });
});
