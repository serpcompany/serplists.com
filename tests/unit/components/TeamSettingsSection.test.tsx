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
  patchTeam: vi.fn(),
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
    patchTeam: workspaceMocks.patchTeam,
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
    reissueTeamInviteLink: vi.fn(),
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
    warning: vi.fn(),
  },
}));

function renderSectionWithMembers(members: unknown[], invites: unknown[] = [], activity: unknown[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['team-members', 'team-1'], members);
  queryClient.setQueryData(['team-invites', 'team-1'], invites);
  queryClient.setQueryData(['team-activity', 'team-1'], activity);

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

  it("names each member's role and status controls after that member", () => {
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
        id: 'member-alice',
        team_id: 'team-1',
        user_id: 'user-2',
        role: 'editor',
        status: 'active',
        email: 'alice@example.com',
        name: 'Alice',
      },
      {
        id: 'member-alice-2',
        team_id: 'team-1',
        user_id: 'user-3',
        role: 'viewer',
        status: 'active',
        email: 'alice.two@example.com',
        name: 'Alice',
      },
      {
        id: 'member-bob',
        team_id: 'team-1',
        user_id: 'user-4',
        role: 'viewer',
        status: 'disabled',
        email: 'bob@example.com',
        name: null,
      },
    ]);

    expect(html).not.toContain('aria-label="Member role"');
    expect(html).not.toContain('aria-label="Member status"');
    // Disabled rows (the owner, you) are still announced, so they are named too.
    expect(html).toContain('aria-label="Role for Owner User (owner@example.com)"');
    expect(html).toContain('aria-label="Role for Alice (alice@example.com)"');
    expect(html).toContain('aria-label="Status for Alice (alice.two@example.com)"');
    expect(html).toContain('aria-label="Role for bob@example.com"');
    expect(html).toContain('aria-label="Status for bob@example.com"');
    expect(html).toContain('aria-label="Make owner: Alice (alice@example.com)"');
    expect(html).not.toContain('undefined');

    const controlNames = Array.from(
      html.matchAll(/aria-label="((?:Role|Status) for [^"]*|Make owner: [^"]*)"/g),
      (match) => match[1],
    );
    expect(controlNames).toHaveLength(10);
    expect(new Set(controlNames).size).toBe(controlNames.length);
  });

  it('offers a new link for each pending invite, since a lost link cannot be shown again', () => {
    const html = renderSectionWithMembers(
      [],
      [
        {
          id: 'invite-1',
          team_id: 'team-1',
          email: 'newhire@example.com',
          role: 'viewer',
          invited_by_user_id: 'user-1',
          expires_at: '2026-10-05T00:00:00.000Z',
          created_at: '2026-09-28T00:00:00.000Z',
        },
      ],
    );

    expect(html).toContain('aria-label="New link for newhire@example.com"');
    expect(html).toContain('aria-label="Revoke invite for newhire@example.com"');
  });

  it('labels a revalidated Organization Run in Activity instead of showing its raw id', () => {
    const html = renderSectionWithMembers(
      [],
      [],
      [
        {
          id: 'event-1',
          action: 'checklist_run.revalidated',
          resource: { type: 'checklist_run', id: 'run-1' },
          createdAt: '2026-09-28T10:00:00.000Z',
          actor: { name: 'Admin User' },
        },
      ],
    );

    expect(html).toContain('Run revalidated');
    expect(html).not.toContain('checklist_run.revalidated');
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
