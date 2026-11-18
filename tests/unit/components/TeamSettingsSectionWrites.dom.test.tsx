import '../../support/mockedToasts';
import React, { act } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import type { Workspace } from '@/contexts/WorkspaceContext';
import { api, type TeamMember } from '@/lib/api';
import { ApiError } from '@/lib/api-errors';

import { createTestQueryClient } from '../../fixtures/queryClient';
import { inputNamed, renderSettled, typeInto } from '../../support/renderInTheDom';
import { chooseTheOption } from '../../support/selectOptions';
import { savedTeam } from '../../fixtures/savedTeam';

const acme: Workspace = {
  id: 'team-1',
  type: 'team',
  name: 'Acme',
  role: 'owner',
  teamId: 'team-1',
  memberId: 'member-1',
  slug: 'acme',
  avatarUrl: 'https://cdn.example.test/acme.png',
};

const workspace = vi.hoisted(() => ({
  active: null as Workspace | null,
  patchTeam: vi.fn(),
  refreshTeams: vi.fn(),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'owner@example.test' }, refreshProfile: vi.fn() }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => {
    const active = workspace.active ?? { id: 'personal', type: 'personal', name: 'Personal', role: 'owner' };
    return {
      activeTeamId: active.type === 'team' ? active.teamId : undefined,
      activeWorkspace: active,
      canManageTeam: active.type === 'team',
      isTeamWorkspace: active.type === 'team',
      patchTeam: workspace.patchTeam,
      refreshTeams: workspace.refreshTeams,
    };
  },
}));
vi.mock('@/lib/api', () => ({
  api: {
    getTeamActivity: vi.fn(),
    getTeamInvites: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn(),
    transferTeamOwnership: vi.fn(),
    updateTeam: vi.fn(),
    updateTeamMember: vi.fn(),
  },
}));

const member = (overrides: Partial<TeamMember>): TeamMember => ({
  id: 'member-2',
  team_id: 'team-1',
  user_id: 'user-2',
  role: 'editor',
  status: 'active',
  email: 'sam@example.test',
  name: 'Sam Editor',
  ...overrides,
});

const members = [member({ id: 'member-1', user_id: 'user-1', role: 'owner', name: 'Olive Owner', email: 'owner@example.test' }), member({})];

let queryClient: QueryClient;

const mountTheSettings = async () => {
  const rendered = await renderSettled(
    <QueryClientProvider client={queryClient}>
      <TeamSettingsSection />
    </QueryClientProvider>,
  );
  if (workspace.active) await screen.findByText('Sam Editor');
  return rendered;
};

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });

const saveTheSettings = () =>
  act(async () => {
    fireEvent.submit(screen.getByRole('button', { name: 'Save Organization' }).closest('form') ?? document.body);
  });

beforeEach(() => {
  workspace.active = acme;
  workspace.refreshTeams.mockResolvedValue(undefined);
  queryClient = createTestQueryClient();
  vi.mocked(api.getTeamMembers).mockResolvedValue(members);
  vi.mocked(api.getTeamActivity).mockResolvedValue([]);
});

afterEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

describe('the Organization settings outside an Organization', () => {
  it('shows nothing in the Personal context', async () => {
    workspace.active = null;

    const { container } = await mountTheSettings();

    expect(container.innerHTML).toBe('');
    expect(api.getTeamMembers).not.toHaveBeenCalled();
  });
});

describe("the Organization's avatar", () => {
  it('removes the avatar on the Organization, not on the account, and reloads the activity', async () => {
    vi.mocked(api.updateTeam).mockResolvedValue(savedTeam({ name: 'Acme', slug: 'acme', avatar_url: null }));
    await mountTheSettings();

    await press('Remove avatar');

    expect(api.updateTeam).toHaveBeenCalledWith('team-1', { avatar_url: null });
    expect(workspace.patchTeam).toHaveBeenCalledWith('team-1', { avatar_url: null });
    expect(toast.success).toHaveBeenCalledWith('Avatar removed successfully!');
    await waitFor(() => expect(api.getTeamActivity).toHaveBeenCalledTimes(2));
  });

  it("shows the server's refusal and keeps the avatar", async () => {
    vi.mocked(api.updateTeam).mockRejectedValue(new ApiError({ status: 403, message: 'Only owners and admins can change this' }));
    await mountTheSettings();

    await press('Remove avatar');

    expect(toast.error).toHaveBeenCalledWith('Only owners and admins can change this');
    expect(workspace.patchTeam).not.toHaveBeenCalled();
  });

  it('reports a failure that is not an answer from the server as a failed removal', async () => {
    vi.mocked(api.updateTeam).mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await mountTheSettings();

    await press('Remove avatar');

    expect(toast.error).toHaveBeenCalledWith('Failed to remove avatar');
  });
});

describe('saving the Organization settings', () => {
  it('refuses an empty name before asking the server', async () => {
    await mountTheSettings();
    await typeInto(inputNamed('Organization name'), '   ');

    await saveTheSettings();

    expect(toast.error).toHaveBeenCalledWith('Organization name is required');
    expect(api.updateTeam).not.toHaveBeenCalled();
  });

  it('sends nothing when the form is submitted with nothing changed', async () => {
    await mountTheSettings();

    await saveTheSettings();

    expect(api.updateTeam).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the save failed", async () => {
    vi.mocked(api.updateTeam).mockRejectedValue(new ApiError({ status: 409, message: 'That slug is taken' }));
    await mountTheSettings();
    await typeInto(inputNamed('Slug'), 'globex');

    await saveTheSettings();

    expect(toast.error).toHaveBeenCalledWith('That slug is taken');
    expect(workspace.patchTeam).not.toHaveBeenCalled();
  });

  it('says the save worked but the refresh did not, and marks the Organization list stale', async () => {
    vi.mocked(api.updateTeam).mockResolvedValue(savedTeam({ name: 'Acme Group', slug: 'acme' }));
    workspace.refreshTeams.mockRejectedValue(new Error('offline'));
    queryClient.setQueryData(['teams', 'user-1'], []);
    await mountTheSettings();
    await typeInto(inputNamed('Organization name'), 'Acme Group');

    await saveTheSettings();

    expect(toast.success).toHaveBeenCalledWith('Organization updated');
    expect(toast.warning).toHaveBeenCalledWith('Saved, but refreshing failed. Reload to see the latest state.');
    expect(queryClient.getQueryState(['teams', 'user-1'])?.isInvalidated).toBe(true);
  });
});

describe("changing a member's role and status", () => {
  it('saves a new role and reloads the members', async () => {
    vi.mocked(api.updateTeamMember).mockResolvedValue({ success: true });
    await mountTheSettings();

    await chooseTheOption('Role for Sam Editor (sam@example.test)', 'Admin');

    expect(api.updateTeamMember).toHaveBeenCalledWith('team-1', 'member-2', { role: 'admin' });
    expect(toast.success).toHaveBeenCalledWith('Member updated');
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(2));
  });

  it('disables a member, and shows why it failed and reloads the members when the server refuses', async () => {
    vi.mocked(api.updateTeamMember).mockRejectedValue(new ApiError({ status: 409, message: 'Keep one active admin' }));
    await mountTheSettings();

    await chooseTheOption('Status for Sam Editor (sam@example.test)', 'Disabled');

    expect(api.updateTeamMember).toHaveBeenCalledWith('team-1', 'member-2', { status: 'disabled' });
    expect(toast.error).toHaveBeenCalledWith('Keep one active admin');
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(2));
  });
});

describe('transferring ownership', () => {
  it('transfers ownership once confirmed and makes the current owner an admin', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.transferTeamOwnership).mockResolvedValue({ success: true, ownerMemberId: 'member-2', ownerUserId: 'user-2' });
    await mountTheSettings();

    await press('Make owner: Sam Editor (sam@example.test)');

    expect(window.confirm).toHaveBeenCalledWith('Transfer Organization ownership to Sam Editor? You will become an admin.');
    expect(api.transferTeamOwnership).toHaveBeenCalledWith('team-1', 'member-2');
    expect(workspace.patchTeam).toHaveBeenCalledWith('team-1', { role: 'admin' });
    expect(toast.success).toHaveBeenCalledWith('Organization ownership transferred');
  });

  it('names a member by their email, or their user id when they have neither, and transfers nothing when the owner cancels', async () => {
    vi.mocked(api.getTeamMembers).mockResolvedValue([
      member({ name: null, email: 'kim@example.test' }),
      member({ id: 'member-3', user_id: 'user-3', name: null, email: null }),
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderSettled(
      <QueryClientProvider client={queryClient}>
        <TeamSettingsSection />
      </QueryClientProvider>,
    );
    await screen.findAllByText('kim@example.test');
    expect(screen.getAllByText('user-3')).toHaveLength(2);

    await press('Make owner: kim@example.test');

    expect(window.confirm).toHaveBeenCalledWith('Transfer Organization ownership to kim@example.test? You will become an admin.');
    expect(api.transferTeamOwnership).not.toHaveBeenCalled();
  });

  it('shows why the transfer failed and reloads the Organizations and members', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.transferTeamOwnership).mockRejectedValue(new Error(''));
    await mountTheSettings();

    await press('Make owner: Sam Editor (sam@example.test)');

    expect(toast.error).toHaveBeenCalledWith('Failed to transfer ownership');
    expect(workspace.refreshTeams).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.getTeamMembers).toHaveBeenCalledTimes(2));
  });
});

describe('lists that failed to load', () => {
  it('retries the members and the activity from their own Retry', async () => {
    vi.mocked(api.getTeamMembers).mockRejectedValueOnce(new ApiError({ status: 500, message: 'Down' }));
    vi.mocked(api.getTeamActivity).mockRejectedValueOnce(new ApiError({ status: 500, message: 'Down' }));
    await renderSettled(
      <QueryClientProvider client={queryClient}>
        <TeamSettingsSection />
      </QueryClientProvider>,
    );
    const membersError = (await screen.findByText("Couldn't load members.")).closest('[role="alert"]');
    const activityError = (await screen.findByText("Couldn't load Organization activity.")).closest('[role="alert"]');
    if (!(membersError instanceof HTMLElement) || !(activityError instanceof HTMLElement)) throw new Error('No load errors');

    await act(async () => {
      fireEvent.click(within(membersError).getByRole('button', { name: 'Retry' }));
      fireEvent.click(within(activityError).getByRole('button', { name: 'Retry' }));
    });

    await screen.findByText('Sam Editor');
    await screen.findByText('No Organization activity recorded yet.');
  });

  it('shows an activity event whose time cannot be read without a time', async () => {
    vi.mocked(api.getTeamActivity).mockResolvedValue([
      {
        id: 'event-1',
        action: 'team.updated',
        createdAt: 'not a date',
        metadata: {},
        actor: { userId: 'user-1', email: 'owner@example.test', name: 'Olive Owner', username: null },
        resource: { type: 'team', id: 'team-1' },
      },
    ]);
    await mountTheSettings();

    const activity = await screen.findByRole('list', { name: 'Activity' });
    expect(within(activity).getByRole('listitem').querySelector('time')?.textContent).toBe('');
  });
});
