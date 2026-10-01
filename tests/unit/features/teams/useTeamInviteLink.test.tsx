import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AcceptedTeamInvite } from '@/lib/api';

import { createFakeContainer, installFakeDomGlobals } from '../../../fixtures/fakeDom';
import { deferred } from '../../../support/deferred';

const apiMocks = vi.hoisted(() => ({
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  getTeamInvitePreview: vi.fn(),
}));
const workspace = vi.hoisted(() => ({
  refreshTeams: async () => [],
  rememberTeam: () => undefined,
  selectWorkspace: () => undefined,
}));
vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => workspace }));

import { useTeamInviteLink } from '@/features/teams/useTeamInviteLink';

let restoreGlobals: () => void;
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
let queryClient: QueryClient | null = null;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  queryClient?.clear();
  queryClient = null;
});

async function openInvite() {
  apiMocks.getTeamInvitePreview.mockResolvedValue({
    status: 'pending',
    teamId: 'team-1',
    teamName: 'Acme Corp',
    role: 'viewer',
    expiresAt: '2026-10-07T00:00:00.000Z',
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient = client;
  let state: ReturnType<typeof useTeamInviteLink> | undefined;
  function Probe() {
    state = useTeamInviteLink('invite-token', 'user-1');
    return null;
  }
  root = createRoot(createFakeContainer() as unknown as Element);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  return () => {
    if (!state) throw new Error('The hook did not render');
    return state;
  };
}

describe('useTeamInviteLink', () => {
  it('sends one answer for a double click on Accept followed by Decline, since Accept and Decline share one guard', async () => {
    const accepted = deferred<AcceptedTeamInvite>();
    apiMocks.acceptTeamInvite.mockReturnValue(accepted.promise);
    const invite = await openInvite();

    let accepting: Promise<unknown> | undefined;
    await act(async () => {
      accepting = invite().accept();
      void invite().accept();
      void invite().decline();
      await settle();
    });

    expect(apiMocks.acceptTeamInvite).toHaveBeenCalledTimes(1);
    expect(apiMocks.declineTeamInvite).not.toHaveBeenCalled();

    accepted.resolve({ memberId: 'member-1', role: 'viewer', teamId: 'team-1' });
    await act(async () => {
      await accepting;
      await settle();
    });
    expect(invite().isAccepted).toBe(true);
  });
});
