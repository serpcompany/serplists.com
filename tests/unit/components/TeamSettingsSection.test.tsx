import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { copyTextToClipboard } from '@/lib/clipboard';
import { queryKeys } from '@/lib/queryKeys';
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
  inPersonalWithTeamsRequestFailed: false,
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

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'current@example.com' } }),
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
    retryWorkspace: vi.fn(),
    selectWorkspace: workspaceMocks.selectWorkspace,
    teams: workspaceMocks.teams,
    ...(workspaceMocks.inPersonalWithTeamsRequestFailed
      ? {
          activeTeamId: undefined,
          activeWorkspace: { id: 'personal', name: 'Personal', role: 'owner', type: 'personal' },
          canManageTeam: false,
          isTeamWorkspace: false,
          teams: [],
          teamsUnavailable: true,
        }
      : {}),
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
  queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-1'), members);
  queryClient.setQueryData(queryKeys.teamInvites('user-1', 'team-1'), invites);
  queryClient.setQueryData(queryKeys.teamActivity('user-1', 'team-1'), activity);

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TeamSettingsSection />
    </QueryClientProvider>,
  );
}

const activeMember = (id: string, userId: string, role: string, name: string, email: string) => ({
  id,
  team_id: 'team-1',
  user_id: userId,
  role,
  status: 'active',
  email,
  name,
});

describe('TeamSettingsSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    workspaceMocks.activeWorkspace.role = 'admin';
    workspaceMocks.canManageTeam = true;
    workspaceMocks.inPersonalWithTeamsRequestFailed = false;
  });

  it('says the Organizations could not load, with Retry, instead of inviting a member of other Organizations to create a duplicate', () => {
    workspaceMocks.inPersonalWithTeamsRequestFailed = true;
    const html = renderSectionWithMembers([]);

    expect(html).toContain('Couldn&#x27;t load your Organizations.');
    expect(html).toContain('Retry');
    expect(html).not.toContain('Create or select an Organization to share templates and runs.');
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

  it('stops typing an Organization name at the limit the API accepts, rather than letting the API refuse it with a raw schema error', () => {
    const html = renderSectionWithMembers([]);

    expect(html).toMatch(/<input[^>]*id="team-name"[^>]*maxLength="120"|<input[^>]*maxLength="120"[^>]*id="team-name"/);
    expect(html).toMatch(/<input[^>]*id="team-settings-name"[^>]*maxLength="120"|<input[^>]*maxLength="120"[^>]*id="team-settings-name"/);
  });

  it('marks the current member row and renders its controls disabled', () => {
    const html = renderSectionWithMembers([
      activeMember('member-current', 'user-1', 'admin', 'Current User', 'current@example.com'),
      activeMember('member-other', 'user-2', 'viewer', 'Viewer User', 'viewer@example.com'),
    ]);

    expect(html).toContain('Current User');
    expect(html).toContain('You');
    expect(html).toMatch(/Current User[\s\S]*disabled/);
    expect(html).not.toContain('Make owner');
  });

  it('renders the owner transfer action for active non-owner members when the current member owns the team', () => {
    workspaceMocks.activeWorkspace.role = 'owner';

    const html = renderSectionWithMembers([
      activeMember('member-current', 'user-1', 'owner', 'Owner User', 'owner@example.com'),
      activeMember('member-other', 'user-2', 'admin', 'Admin User', 'admin@example.com'),
    ]);

    expect(html).toContain('Admin User');
    expect(html).toContain('Make owner');
  });

  it("names each member's role and status controls after that member, disabled rows (the owner, you) included, since they are still announced", () => {
    workspaceMocks.activeWorkspace.role = 'owner';

    const html = renderSectionWithMembers([
      activeMember('member-current', 'user-1', 'owner', 'Owner User', 'owner@example.com'),
      activeMember('member-alice', 'user-2', 'editor', 'Alice', 'alice@example.com'),
      activeMember('member-alice-2', 'user-3', 'viewer', 'Alice', 'alice.two@example.com'),
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

    const html = renderSectionWithMembers([], [], activity);

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
      activeMember('member-current', 'user-1', 'viewer', 'Viewer User', 'viewer@example.com'),
      activeMember('member-editor', 'user-2', 'editor', 'Editor User', 'editor@example.com'),
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
    seedQueryError(queryClient, queryKeys.teamMembers('user-1', 'team-1'));
    seedQueryError(queryClient, queryKeys.teamInvites('user-1', 'team-1'));
    seedQueryError(queryClient, queryKeys.teamActivity('user-1', 'team-1'));

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
    seedQueryError(queryClient, queryKeys.teamMembers('user-1', 'team-1'), [
      activeMember('member-other', 'user-2', 'viewer', 'Viewer User', 'viewer@example.com'),
    ]);
    queryClient.setQueryData(queryKeys.teamInvites('user-1', 'team-1'), []);
    queryClient.setQueryData(queryKeys.teamActivity('user-1', 'team-1'), []);

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
    queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-1'), []);

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
