import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { copyTextToClipboard } from '@/lib/clipboard';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';

const workspaceMocks = vi.hoisted(() => ({
  activeWorkspace: {
    id: 'team-1',
    memberId: 'member-current',
    name: 'Acme Team',
    role: 'admin',
    slug: 'acme-team',
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

function renderSectionWithMembers(members: unknown[], activity: unknown[] = []) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient.setQueryData(['team-members', 'team-1'], members);
  queryClient.setQueryData(['team-invites', 'team-1'], []);
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

  it('renders every activity event it loaded, since the request is already limited to what the page shows', () => {
    const activity = Array.from({ length: 12 }, (_, index) => ({
      id: `event-${index}`,
      action: 'team_member.updated',
      resource: { type: 'team_member', id: `member-${index}` },
      metadata: null,
      requestId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      actor: { userId: 'user-1', email: null, name: `Actor ${index}`, username: null },
    }));

    const html = renderSectionWithMembers([], activity);

    expect(html.match(/Member updated/g)).toHaveLength(12);
    expect(html).toContain('Actor 11');
  });

  it('keeps Save Organization disabled until the name or slug differs from the saved Organization', () => {
    const html = renderSectionWithMembers([]);

    expect(html).toMatch(/<input[^>]*id="team-settings-name"[^>]*value="Acme Team"/);
    expect(html).toMatch(/<input[^>]*id="team-settings-slug"[^>]*value="acme-team"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save Organization<\/button>/);
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

  it('shows load errors with Retry instead of empty members, invites, and activity', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, ['team-members', 'team-1']);
    seedQueryError(queryClient, ['team-invites', 'team-1']);
    seedQueryError(queryClient, ['team-activity', 'team-1']);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TeamSettingsSection />
      </QueryClientProvider>,
    );

    expect(html).toContain('load members');
    expect(html).toContain('load pending invites');
    expect(html).toContain('load Organization activity');
    expect(html.match(/>Retry</g)).toHaveLength(3);
    expect(html).not.toContain('No members found.');
    expect(html).not.toContain('No pending invites.');
    expect(html).not.toContain('No Organization activity recorded yet.');
  });

  it('keeps loaded members visible when a later refresh fails', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, ['team-members', 'team-1'], [
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
    queryClient.setQueryData(['team-invites', 'team-1'], []);
    queryClient.setQueryData(['team-activity', 'team-1'], []);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TeamSettingsSection />
      </QueryClientProvider>,
    );

    expect(html).toContain('Viewer User');
    expect(html).toContain('refresh members');
    expect(html).toContain('No pending invites.');
    expect(html).not.toContain('load members');
  });

  it('shows no load error for invites and activity when the member cannot manage the Organization', () => {
    workspaceMocks.activeWorkspace.role = 'viewer';
    workspaceMocks.canManageTeam = false;
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['team-members', 'team-1'], []);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TeamSettingsSection />
      </QueryClientProvider>,
    );

    expect(html).toContain('No members found.');
    expect(html).not.toContain('Retry');
    expect(html).not.toContain('Loading invites...');
    expect(html).not.toContain('Loading activity...');
  });
});
