import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspace, WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';
import type { TeamSummary } from '@/lib/api';
import { createTestQueryClient, seedQueryError } from '../../fixtures/queryClient';
import { deferred } from '../../support/deferred';
import { settle } from '../../support/queryHookProbe';

const apiMocks = vi.hoisted(() => ({
  createTeam: vi.fn(),
  getTeams: vi.fn(),
}));

vi.mock('@/lib/api', () => ({ api: apiMocks }));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, user: { id: 'user-1' } }),
}));

const teamsKey = ['teams', 'user-1'];

const joinedTeam: TeamSummary = {
  id: 'team-1',
  memberId: 'member-1',
  membershipStatus: 'active',
  name: 'Acme',
  role: 'editor',
};

const workspaceFromOneRender = (queryClient: QueryClient) => {
  let value: ReturnType<typeof useWorkspace> | undefined;
  const Capture = () => {
    value = useWorkspace();
    return null;
  };
  renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider>
        <Capture />
      </WorkspaceProvider>
    </QueryClientProvider>,
  );
  if (!value) throw new Error('WorkspaceProvider did not render');
  return value;
};

const startTeamsRequestThatReadTheServerBeforeTheWrite = (queryClient: QueryClient) => {
  const staleTeams = deferred<TeamSummary[]>();
  void queryClient.prefetchQuery({ queryKey: teamsKey, queryFn: () => staleTeams.promise });
  return staleTeams;
};

describe('WorkspaceProvider teams cache', () => {
  beforeEach(() => {
    apiMocks.getTeams.mockReset();
  });

  it('refreshTeams fetches again instead of joining a teams request that predates the write', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const workspace = workspaceFromOneRender(queryClient);
    const staleTeams = startTeamsRequestThatReadTheServerBeforeTheWrite(queryClient);
    apiMocks.getTeams.mockResolvedValue([joinedTeam]);

    workspace.rememberTeam(joinedTeam);
    const refreshed = workspace.refreshTeams();
    staleTeams.resolve([]);

    await expect(refreshed).resolves.toEqual([joinedTeam]);
    expect(queryClient.getQueryData(teamsKey)).toEqual([joinedTeam]);
  });

  it('drops an older teams response that lands after a remembered Organization, inventing no list the server never sent', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const workspace = workspaceFromOneRender(queryClient);
    const staleTeams = startTeamsRequestThatReadTheServerBeforeTheWrite(queryClient);

    workspace.rememberTeam(joinedTeam);
    staleTeams.resolve([]);
    await settle();

    expect(queryClient.getQueryData(teamsKey)).toBeUndefined();
  });

  it('adds a remembered Organization to a list the server sent', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const otherTeam = { ...joinedTeam, id: 'team-2', name: 'Bravo' };
    queryClient.setQueryData(teamsKey, [otherTeam]);
    const workspace = workspaceFromOneRender(queryClient);

    workspace.rememberTeam(joinedTeam);

    expect(queryClient.getQueryData(teamsKey)).toEqual([joinedTeam, otherTeam]);
  });

  it('accepting an invite without team details waits for a teams list read after the accept', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const workspace = workspaceFromOneRender(queryClient);
    const staleTeams = startTeamsRequestThatReadTheServerBeforeTheWrite(queryClient);
    apiMocks.getTeams.mockResolvedValue([joinedTeam]);

    const accepted = acceptTeamInviteForWorkspace('invite-token', {
      acceptTeamInvite: async () => ({ memberId: 'member-1', role: 'editor', teamId: 'team-1' }),
      refreshTeams: workspace.refreshTeams,
      rememberTeam: workspace.rememberTeam,
      selectWorkspace: vi.fn(),
    });
    await settle();
    staleTeams.resolve([]);
    await accepted;

    expect(apiMocks.getTeams).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(teamsKey)).toEqual([joinedTeam]);
  });

  it('refreshTeams still reports a failed request to its caller', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const workspace = workspaceFromOneRender(queryClient);
    queryClient.setQueryData(teamsKey, [joinedTeam]);
    apiMocks.getTeams.mockRejectedValue(new Error('Network down'));

    await expect(workspace.refreshTeams()).rejects.toThrow('Network down');
    expect(queryClient.getQueryData(teamsKey)).toEqual([joinedTeam]);
  });
});

describe('WorkspaceProvider after the teams request failed, which must not read as no Organizations', () => {
  it('reports the teams list as unavailable in Personal, without blocking Personal', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, teamsKey);
    const workspace = workspaceFromOneRender(queryClient);

    expect(workspace.activeWorkspaceId).toBe('personal');
    expect(workspace.workspaceStatus).toBe('ready');
    expect(workspace.teamsUnavailable).toBe(true);
  });

  it("calls an Organization's role unavailable, not gone, when the list failed", () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, teamsKey);
    const workspace = workspaceFromOneRender(queryClient);

    expect(workspace.isRoleUnavailable('acme')).toBe(true);
    expect(workspace.isRoleUnavailable(undefined)).toBe(false);
  });

  it('keeps the last loaded list after a failed refresh, where a missing Organization means no role', () => {
    const queryClient = createTestQueryClient();
    seedQueryError(queryClient, teamsKey, [joinedTeam]);
    const workspace = workspaceFromOneRender(queryClient);

    expect(workspace.teamsUnavailable).toBe(false);
    expect(workspace.isRoleUnavailable('team-1')).toBe(false);
    expect(workspace.isRoleUnavailable('acme')).toBe(false);
  });
});
