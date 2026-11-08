import { navigation } from '../../support/mockedNextNavigation';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TeamSummary } from '@/lib/api';

import { letQueryUpdatesReachObservers } from '../../support/queryNotifications';
import { renderTheWorkspaceProvider, type ShownWorkspace } from '../../support/workspaceProviderProbe';

const { createTeam, getTeams } = vi.hoisted(() => ({ createTeam: vi.fn(), getTeams: vi.fn() }));
const auth = vi.hoisted(() => ({
  isLoading: false,
  sessionStatus: 'authenticated',
  user: { id: 'user-1' } as { id: string } | null,
}));

vi.mock('@/lib/api', () => ({ api: { createTeam, getTeams } }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => auth }));

const organization = (id: string, name = `Organization ${id}`): TeamSummary => ({
  id,
  memberId: `member-${id}`,
  membershipStatus: 'active',
  name,
  role: 'owner',
});

const signIn = () => {
  auth.isLoading = false;
  auth.sessionStatus = 'authenticated';
  auth.user = { id: 'user-1' };
};

let tab: ReturnType<typeof renderTheWorkspaceProvider> | undefined;

async function openTheProvider(): Promise<{ rerender: () => void; workspace: () => ShownWorkspace }> {
  const opened = renderTheWorkspaceProvider();
  tab = opened;
  await letQueryUpdatesReachObservers();
  return opened;
}

beforeEach(() => {
  signIn();
  navigation.reset('/');
  getTeams.mockReset();
  createTeam.mockReset();
  getTeams.mockResolvedValue([organization('team-1', 'Acme')]);
});

afterEach(() => {
  tab?.unmount();
  tab = undefined;
});

describe('WorkspaceProvider createTeam', () => {
  it('lists the new Organization, switches to it, and reads the list again', async () => {
    const { workspace } = await openTheProvider();
    createTeam.mockResolvedValue(organization('team-2', 'Globex'));
    getTeams.mockResolvedValue([organization('team-1', 'Acme'), organization('team-2', 'Globex')]);

    await act(() => workspace().createTeam({ name: 'Globex' }));
    await letQueryUpdatesReachObservers();

    expect(createTeam).toHaveBeenCalledWith({ name: 'Globex' });
    expect(workspace().activeWorkspace.id).toBe('team-2');
    expect(workspace().teams.map(({ name }) => name)).toEqual(['Acme', 'Globex']);
    expect(getTeams).toHaveBeenCalledTimes(2);
  });
});

describe('WorkspaceProvider patchTeam', () => {
  it("shows an Organization's saved changes in the list right away", async () => {
    const { workspace } = await openTheProvider();

    act(() => workspace().patchTeam('team-1', { name: 'Acme Inc' }));

    expect(workspace().teams.map(({ name }) => name)).toEqual(['Acme Inc']);
    expect(workspace().workspaces.map(({ name }) => name)).toEqual(['Personal', 'Acme Inc']);
  });

  it('patches an Organization this tab remembers while signed out, without a list to change', async () => {
    auth.user = null;
    auth.sessionStatus = 'loading';
    auth.isLoading = true;
    const { workspace } = await openTheProvider();
    act(() => workspace().rememberTeam(organization('team-9', 'Initech')));

    act(() => workspace().patchTeam('team-9', { name: 'Initrode' }));

    expect(workspace().teams.map(({ name }) => name)).toEqual(['Initrode']);
  });
});

describe('WorkspaceProvider while nobody is signed in', () => {
  it('reads no Organizations for refreshTeams', async () => {
    auth.user = null;
    auth.sessionStatus = 'unauthenticated';
    const { workspace } = await openTheProvider();

    expect(await workspace().refreshTeams()).toEqual([]);
    expect(getTeams).not.toHaveBeenCalled();
  });

  it('goes back to Personal when the user who had an Organization open signs out', async () => {
    const { rerender, workspace } = await openTheProvider();
    act(() => workspace().selectWorkspace('team-1'));
    expect(workspace().activeWorkspace.id).toBe('team-1');

    auth.user = null;
    auth.sessionStatus = 'unauthenticated';
    rerender();
    await letQueryUpdatesReachObservers();

    expect(workspace().activeWorkspace.id).toBe('personal');
    signIn();
    rerender();
    await letQueryUpdatesReachObservers();
    expect(workspace().activeWorkspace.id).toBe('personal');
  });
});
