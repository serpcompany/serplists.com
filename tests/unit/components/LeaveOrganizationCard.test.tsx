import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LeaveOrganizationCard } from '@/components/account/LeaveOrganizationCard';

const workspace = vi.hoisted(() => ({
  activeWorkspace: { id: 'personal', type: 'personal', name: 'Personal', role: 'owner' } as Record<string, unknown>,
  activeTeamId: undefined as string | undefined,
  refreshTeams: vi.fn(async () => []),
  selectWorkspace: vi.fn(),
}));

vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => workspace,
}));

vi.mock('@/lib/api', () => ({ api: { leaveTeam: vi.fn() } }));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function render() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LeaveOrganizationCard />
    </QueryClientProvider>,
  );
}

const teamWorkspace = (role: string) => ({
  id: 'team-1',
  type: 'team',
  name: 'Acme Corp',
  role,
  teamId: 'team-1',
  memberId: 'member-1',
});

describe('LeaveOrganizationCard', () => {
  beforeEach(() => {
    workspace.activeWorkspace = { id: 'personal', type: 'personal', name: 'Personal', role: 'owner' };
  });

  it('lets a member leave the selected Organization', () => {
    workspace.activeWorkspace = teamWorkspace('editor');

    const html = render();

    expect(html).toContain('Leave Organization');
    expect(html).toContain('Acme Corp');
  });

  it('is hidden for the owner, who must transfer ownership first', () => {
    workspace.activeWorkspace = teamWorkspace('owner');

    expect(render()).toBe('');
  });

  it('is hidden in the Personal context', () => {
    expect(render()).toBe('');
  });
});
