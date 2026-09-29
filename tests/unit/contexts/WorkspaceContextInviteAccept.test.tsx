import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';

// Accepting an invite link adds the joined Organization to the teams cache. When the teams
// request had failed (no list yet), that write invented a one-team list, which read as a
// settled server list without the stored Organization, and the tab dropped to Personal:
// only a settled, successful list may rule out the stored Organization.

const apiMocks = vi.hoisted(() => ({ createTeam: vi.fn(), getTeams: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: 'user-1' } }),
}));

import { useWorkspace, WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { acceptTeamInviteForWorkspace } from '@/features/teams/acceptTeamInvite';
import { safeLocalStorage } from '@/lib/browserStorage';

const STORAGE_KEY = 'serplists.activeWorkspaceId';

const team = (id: string, name: string): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name,
  role: 'editor',
});
const joined = team('team-x', 'Joined Org');
const stored = team('team-y', 'Stored Org');

// Vitest runs in node with no DOM. The probe renders nothing, so React DOM needs only a
// container object, and a window while it commits, to run effects.
const fakeDocument = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
const fakeContainer = {
  nodeType: 1,
  nodeName: 'DIV',
  tagName: 'DIV',
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  ownerDocument: fakeDocument,
  addEventListener() {},
  removeEventListener() {},
};
const globals = globalThis as Record<string, unknown>;
const savedGlobals = { window: globals.window, act: globals.IS_REACT_ACT_ENVIRONMENT };

beforeAll(() => {
  globals.window = { HTMLIFrameElement: class {}, document: fakeDocument, addEventListener() {}, removeEventListener() {} };
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globals.window = savedGlobals.window;
  globals.IS_REACT_ACT_ENVIRONMENT = savedGlobals.act;
});

let root: Root | null = null;

beforeEach(() => {
  apiMocks.getTeams.mockReset();
  safeLocalStorage.setItem(STORAGE_KEY, stored.id);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  safeLocalStorage.removeItem(STORAGE_KEY);
});

// React Query notifies observers on a timer; let every pending update land.
const settle = () =>
  act(async () => {
    for (let tick = 0; tick < 5; tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

async function mountWorkspace() {
  let value: ReturnType<typeof useWorkspace> | undefined;
  const Probe = () => {
    value = useWorkspace();
    return null;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(fakeContainer as unknown as Element);
  act(() =>
    root?.render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider>
          <Probe />
        </WorkspaceProvider>
      </QueryClientProvider>,
    ),
  );
  await settle();
  return {
    queryClient,
    workspace: () => {
      if (!value) throw new Error('WorkspaceProvider did not render');
      return value;
    },
  };
}

const acceptInvite = async (workspace: ReturnType<typeof useWorkspace>) => {
  await act(async () => {
    await acceptTeamInviteForWorkspace('invite-token', {
      acceptTeamInvite: async () => ({ memberId: joined.memberId, role: 'editor', team: joined, teamId: joined.id }),
      refreshTeams: workspace.refreshTeams,
      rememberTeam: workspace.rememberTeam,
    });
  });
  await settle();
};

describe('accepting an invite link after the teams request failed', () => {
  it('keeps the stored Organization unconfirmed, not Personal, when the refresh fails too', async () => {
    apiMocks.getTeams.mockRejectedValue(new Error('Teams unavailable'));
    const { queryClient, workspace } = await mountWorkspace();
    expect(workspace().workspaceStatus).toBe('error');

    await acceptInvite(workspace());

    expect(workspace().workspaceStatus).toBe('error');
    expect(workspace().teams.map(({ id }) => id)).toEqual([joined.id]);
    // No list was read from the server, so none is cached.
    expect(queryClient.getQueryData(['teams', 'user-1'])).toBeUndefined();

    // Once the teams request works, the tab is in its stored Organization.
    apiMocks.getTeams.mockResolvedValue([joined, stored]);
    act(() => workspace().retryWorkspace());
    await settle();

    expect(workspace().workspaceStatus).toBe('ready');
    expect(workspace().activeWorkspaceId).toBe(stored.id);
  });

  it('keeps the stored Organization when the refresh lists it', async () => {
    apiMocks.getTeams.mockRejectedValueOnce(new Error('Teams unavailable'));
    const { workspace } = await mountWorkspace();
    apiMocks.getTeams.mockResolvedValue([joined, stored]);

    await acceptInvite(workspace());

    expect(workspace().workspaceStatus).toBe('ready');
    expect(workspace().activeWorkspaceId).toBe(stored.id);
  });
});
