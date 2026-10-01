import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';

import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';

const apiMocks = vi.hoisted(() => ({ createTeam: vi.fn(), getTeams: vi.fn() }));
const signedIn = vi.hoisted(() => ({ userId: 'user-1' }));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: signedIn.userId } }),
}));

import { useWorkspace, WorkspaceProvider } from '@/contexts/WorkspaceContext';

const organization = (id: string): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name: `Organization ${id}`,
  role: 'owner',
});

const settleQueries = () =>
  act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

let restoreGlobals: () => void = () => undefined;
let root: Root | null = null;

async function mountWorkspace() {
  const rendered: { value?: ReturnType<typeof useWorkspace> } = {};
  const Probe = () => {
    rendered.value = useWorkspace();
    return null;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = () =>
    act(() =>
      root?.render(
        <QueryClientProvider client={queryClient}>
          <WorkspaceProvider>
            <Probe />
          </WorkspaceProvider>
        </QueryClientProvider>,
      ),
    );
  root = createRoot(createFakeContainer() as unknown as Element);
  render();
  await settleQueries();
  const workspace = () => {
    if (!rendered.value) throw new Error('WorkspaceProvider did not render');
    return rendered.value;
  };
  return { render, workspace, shownTeamIds: () => workspace().teams.map(({ id }) => id) };
}

beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});

afterAll(() => restoreGlobals());

beforeEach(() => {
  signedIn.userId = 'user-1';
  apiMocks.getTeams.mockReset();
  apiMocks.getTeams.mockRejectedValue(new Error('Teams unavailable'));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

describe('Organizations remembered in this tab', () => {
  it('are shown until the next list the server sends, which replaces them', async () => {
    const { workspace, shownTeamIds } = await mountWorkspace();
    act(() => workspace().rememberTeam(organization('created')));
    expect(shownTeamIds()).toEqual(['created']);

    apiMocks.getTeams.mockResolvedValue([organization('listed')]);
    act(() => workspace().retryWorkspace());
    await settleQueries();

    expect(shownTeamIds()).toEqual(['listed']);
  });

  it('are never shown to the next user who signs in on the tab', async () => {
    const { render, workspace, shownTeamIds } = await mountWorkspace();
    act(() => workspace().rememberTeam(organization('created')));
    expect(shownTeamIds()).toEqual(['created']);

    signedIn.userId = 'user-2';
    render();
    await settleQueries();

    expect(shownTeamIds()).toEqual([]);
  });
});
