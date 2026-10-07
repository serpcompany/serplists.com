import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AccountOrganizationsSection } from '@/components/account/AccountOrganizationsSection';
import { AgentAccessSection } from '@/components/account/AgentAccessSection';
import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { ArchiveRecoverySection } from '@/components/dashboard/ArchiveRecoverySection';

const session = vi.hoisted(() => ({ userId: 'user-a' }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: session.userId, email: `${session.userId}@example.com` } }),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: 'team-1',
    activeWorkspace: { id: 'team-1', memberId: 'member-1', name: 'Shared Org', role: 'admin', teamId: 'team-1', type: 'team' },
    canManageTeam: true,
    createTeam: vi.fn(),
    getPermissions: () => ({ canRun: true, canEditTemplates: true, canManage: true }),
    isTeamWorkspace: true,
    rememberTeam: vi.fn(),
    refreshTeams: vi.fn(),
    selectWorkspace: vi.fn(),
    teams: [],
    workspaceScopeId: 'team-1',
  }),
}));

vi.mock('@/lib/api', () => ({
  api: new Proxy({}, { get: () => vi.fn().mockResolvedValue([]) }),
  getAgentMcpEndpoint: () => 'https://serplists.test/api/mcp',
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const userADataByQueryKeyRoot: Record<string, unknown[]> = {
  'incoming-team-invites': [
    {
      id: 'invite-a',
      teamId: 'team-acme',
      teamName: 'Acme Corp',
      role: 'editor',
      inviterName: null,
      inviterEmail: 'jane@acme.com',
      expiresAt: '2026-10-01T00:00:00.000Z',
    },
  ],
  'agent-keys': [
    {
      id: 'key-a',
      name: 'Prod SOP bot',
      keyPrefix: 'sl_run_a1b2',
      createdAt: '2026-09-01T00:00:00.000Z',
      lastUsedAt: null,
      permissions: ['runs:read'],
    },
  ],
  'team-members': [
    { id: 'member-disabled', team_id: 'team-1', user_id: 'user-x', role: 'viewer', status: 'disabled', name: 'Disabled Member' },
  ],
  'team-invites': [
    { id: 'pending-a', email: 'pending-invitee@example.com', role: 'viewer', expiresAt: '2026-10-01T00:00:00.000Z' },
  ],
  'team-activity': [
    { id: 'activity-a', action: 'team.updated', createdAt: '2026-09-01T00:00:00.000Z', actor: { name: 'Admin Activity Actor' } },
  ],
  'archived-templates': [{ id: 'archived-a', title: 'User A Archived Template', deleted_at: '2026-09-01T00:00:00.000Z' }],
  'archived-runs': [{ id: 'archived-run-a', title: 'User A Archived Run', deleted_at: '2026-09-01T00:00:00.000Z' }],
};

const privateText = [
  'Acme Corp',
  'jane@acme.com',
  'Prod SOP bot',
  'Disabled Member',
  'pending-invitee@example.com',
  'Admin Activity Actor',
  'User A Archived Template',
  'User A Archived Run',
];

function renderAs(client: QueryClient, userId: string, element: React.ReactElement): string {
  session.userId = userId;
  return renderToStaticMarkup(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

function finishUserAFetchesWithTheirData(client: QueryClient) {
  for (const query of client.getQueryCache().getAll()) {
    const data = userADataByQueryKeyRoot[String(query.queryKey[0])];
    if (data) client.setQueryData(query.queryKey, data);
  }
}

function renderAsUserAThenUserBOnOneQueryClient(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  renderAs(client, 'user-a', element);
  finishUserAFetchesWithTheirData(client);
  const userAHtml = renderAs(client, 'user-a', element);
  const userBHtml = renderAs(client, 'user-b', element);
  client.clear();
  return { userAHtml, userBHtml };
}

describe('private account data after user A signs out and user B signs in on the same tab, whose QueryClient outlives the session', () => {
  it.each([
    ['Organization invites', <AccountOrganizationsSection key="invites" />, ['Acme Corp', 'jane@acme.com']],
    ['Organization settings', <TeamSettingsSection key="team" />, ['Disabled Member', 'pending-invitee@example.com']],
    ['Run Keys', <AgentAccessSection key="run-keys" />, ['Prod SOP bot']],
    ['Archive', <ArchiveRecoverySection key="archive" />, ['User A Archived Template', 'User A Archived Run']],
  ])('does not show user A\'s cached %s to user B', (_name, element, userAVisible) => {
    const { userAHtml, userBHtml } = renderAsUserAThenUserBOnOneQueryClient(element);

    for (const text of userAVisible) expect(userAHtml).toContain(text);
    for (const text of privateText) expect(userBHtml).not.toContain(text);
  });
});
