import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { copyTextToClipboard } from '@/lib/clipboard';

const workspaceMocks = vi.hoisted(() => ({
  activeWorkspace: {
    id: 'team-1',
    memberId: 'member-current',
    name: 'Acme Team',
    role: 'admin',
    teamId: 'team-1',
    type: 'team',
  },
  canManageTeam: true,
  createTeam: vi.fn(),
  rememberTeam: vi.fn(),
  refreshTeams: vi.fn(),
  selectWorkspace: vi.fn(),
  teams: [
    {
      id: 'team-1',
      memberId: 'member-current',
      name: 'Acme Team',
      role: 'admin',
      slug: 'acme-team',
    },
  ],
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: 'team-1',
    activeWorkspace: workspaceMocks.activeWorkspace,
    canManageTeam: workspaceMocks.canManageTeam,
    createTeam: workspaceMocks.createTeam,
    isTeamWorkspace: true,
    rememberTeam: workspaceMocks.rememberTeam,
    refreshTeams: workspaceMocks.refreshTeams,
    selectWorkspace: workspaceMocks.selectWorkspace,
    teams: workspaceMocks.teams,
  }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    createTeamInvite: vi.fn(),
    getTeamActivity: vi.fn().mockResolvedValue([]),
    getTeamInvites: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
    revokeTeamInvite: vi.fn(),
    transferTeamOwnership: vi.fn(),
    updateTeam: vi.fn(),
    updateTeamMember: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function renderSectionWithMembers(members: unknown[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['team-members', 'team-1'], members);
  queryClient.setQueryData(['team-invites', 'team-1'], []);
  queryClient.setQueryData(['team-activity', 'team-1'], []);

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TeamSettingsSection />
    </QueryClientProvider>,
  );
}

describe('TeamSettingsSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    workspaceMocks.activeWorkspace.role = 'admin';
    workspaceMocks.canManageTeam = true;
  });

  it('copies invite links through the clipboard API when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });

    await expect(copyTextToClipboard('https://serplists.com/team-invites/token')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://serplists.com/team-invites/token');
  });

  it('reports copy failure when the clipboard API is unavailable or denied', async () => {
    vi.stubGlobal('navigator', {});
    await expect(copyTextToClipboard('https://serplists.com/team-invites/token')).resolves.toBe(false);

    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText,
      },
    });

    await expect(copyTextToClipboard('https://serplists.com/team-invites/token')).resolves.toBe(false);
  });

  // The API refuses a longer Organization name with a raw schema error.
  it('stops typing an Organization name at the limit the API accepts', () => {
    const html = renderSectionWithMembers([]);

    expect(html).toMatch(/<input[^>]*id="team-name"[^>]*maxLength="120"|<input[^>]*maxLength="120"[^>]*id="team-name"/);
    expect(html).toMatch(/<input[^>]*id="team-settings-name"[^>]*maxLength="120"|<input[^>]*maxLength="120"[^>]*id="team-settings-name"/);
  });

  it('marks the current member row and renders its controls disabled', () => {
    const html = renderSectionWithMembers([
      {
        id: 'member-current',
        team_id: 'team-1',
        user_id: 'user-1',
        role: 'admin',
        status: 'active',
        email: 'current@example.com',
        name: 'Current User',
      },
      {
        id: 'member-other',
        team_id: 'team-1',
        user_id: 'user-2',
        role: 'viewer',
        status: 'active',
        email: 'viewer@example.com',
        name: 'Viewer User',
      },
    ]);

    expect(html).toContain('Current User');
    expect(html).toContain('You');
    expect(html).toMatch(/Current User[\s\S]*disabled/);
    expect(html).not.toContain('Make owner');
  });

  it('renders the owner transfer action for active non-owner members when the current member owns the team', () => {
    workspaceMocks.activeWorkspace.role = 'owner';

    const html = renderSectionWithMembers([
      {
        id: 'member-current',
        team_id: 'team-1',
        user_id: 'user-1',
        role: 'owner',
        status: 'active',
        email: 'owner@example.com',
        name: 'Owner User',
      },
      {
        id: 'member-other',
        team_id: 'team-1',
        user_id: 'user-2',
        role: 'admin',
        status: 'active',
        email: 'admin@example.com',
        name: 'Admin User',
      },
    ]);

    expect(html).toContain('Admin User');
    expect(html).toContain('Make owner');
  });

  it('renders team members as read-only for roles that cannot manage the team', () => {
    workspaceMocks.activeWorkspace.role = 'viewer';
    workspaceMocks.canManageTeam = false;

    const html = renderSectionWithMembers([
      {
        id: 'member-current',
        team_id: 'team-1',
        user_id: 'user-1',
        role: 'viewer',
        status: 'active',
        email: 'viewer@example.com',
        name: 'Viewer User',
      },
      {
        id: 'member-editor',
        team_id: 'team-1',
        user_id: 'user-2',
        role: 'editor',
        status: 'active',
        email: 'editor@example.com',
        name: 'Editor User',
      },
    ]);

    expect(html).toContain('Owners and admins manage Organization settings, invites, and activity.');
    expect(html).toContain('Views shared templates and runs.');
    expect(html).toContain('Editor User');
    expect(html).not.toContain('Invite email');
    expect(html).not.toContain('Pending invites');
    expect(html).not.toContain('Activity');
    expect(html).not.toContain('role="combobox"');
  });
});
