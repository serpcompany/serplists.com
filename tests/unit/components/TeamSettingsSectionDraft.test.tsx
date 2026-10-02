import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { queryKeys } from '@/lib/queryKeys';

import { createFakeContainer, dispatch, elementOf, FakeElement, findAll } from '../../fixtures/fakeDom';
import { aFakeDomForEachTest, typeThroughTheFieldsOwnOnChange } from '../../support/fakeDomRoots';
import { present } from '../../support/elements';
import type { api } from '@/lib/api';

type TeamWorkspace = {
  id: string;
  teamId: string;
  type: 'team';
  memberId: string;
  name: string;
  role: 'owner' | 'admin';
  slug: string | null;
};

type UpdateTeam = (typeof api)['updateTeam'];

type WorkspaceDouble = {
  active: TeamWorkspace | null;
  patchTeam: Mock<(teamId: string, patch: Partial<TeamWorkspace>) => void>;
  refreshTeams: Mock<() => Promise<void>>;
  updateTeam: Mock<UpdateTeam>;
};

const workspace = vi.hoisted((): WorkspaceDouble => ({
  active: null,
  patchTeam: vi.fn(),
  refreshTeams: vi.fn(),
  updateTeam: vi.fn(),
}));

const activeTeam = () => present(workspace.active, 'the active Organization');

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'owner@example.com' } }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: activeTeam().teamId,
    activeWorkspace: activeTeam(),
    canManageTeam: true,
    createTeam: vi.fn(),
    isTeamWorkspace: true,
    patchTeam: workspace.patchTeam,
    refreshTeams: workspace.refreshTeams,
    rememberTeam: vi.fn(),
    selectWorkspace: vi.fn(),
    teams: [activeTeam()],
  }),
}));
vi.mock('@/lib/api', () => ({
  api: {
    getTeamActivity: vi.fn().mockResolvedValue([]),
    getTeamInvites: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
    updateTeam: (...args: Parameters<UpdateTeam>) => workspace.updateTeam(...args),
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/components/ui/select', async () => (await import('../../support/overlaysInPlace')).selectWithoutPopup);
vi.mock('@/components/account/TeamInvitesPanel', () => ({ TeamInvitesPanel: () => null }));
vi.mock('@/components/account/TeamActivityList', () => ({ TeamActivityList: () => null }));

const acme = (overrides: Partial<TeamWorkspace> = {}): TeamWorkspace => ({
  id: 'team-1',
  teamId: 'team-1',
  type: 'team',
  memberId: 'member-1',
  name: 'Acme',
  role: 'owner',
  slug: 'acme',
  ...overrides,
});

const rebuildActiveWorkspaceWithPatch = (_teamId: string, patch: Partial<TeamWorkspace>) => {
  workspace.active = { ...activeTeam(), ...patch };
};

let root: Root | null = null;
let container: FakeElement;
let queryClient: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  workspace.active = acme();
  workspace.refreshTeams.mockResolvedValue(undefined);
  workspace.patchTeam.mockImplementation(rebuildActiveWorkspaceWithPatch);
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-1'), []);
  queryClient.setQueryData(queryKeys.teamInvites('user-1', 'team-1'), []);
  queryClient.setQueryData(queryKeys.teamActivity('user-1', 'team-1'), []);
});
afterEach(() => {
  queryClient.clear();
});

const fakeDom = aFakeDomForEachTest();

const renderWithCurrentWorkspace = async () => {
  await act(async () => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <TeamSettingsSection />
      </QueryClientProvider>,
    );
  });
};

const mount = async () => {
  container = createFakeContainer();
  root = fakeDom.track(createRoot(container));
  await renderWithCurrentWorkspace();
};

const byId = (id: string) => {
  const [node] = findAll(container, (entry) => entry instanceof FakeElement && entry.getAttribute('id') === id);
  return elementOf(node, `the element with id ${id}`);
};

const nameField = () => byId('team-settings-name');
const slugField = () => byId('team-settings-slug');

const typeInto = typeThroughTheFieldsOwnOnChange;

const saveButton = () => {
  const [button] = findAll(
    container,
    (node) => node.nodeName === 'BUTTON' && node.textContent.startsWith('Sav'),
  );
  return elementOf(button, 'the Save Organization button');
};

describe('TeamSettingsSection keeps what the user typed in the Organization name and slug when the context rebuilds the active Organization object', () => {
  it('keeps a typed name when Make owner patches the role', async () => {
    await mount();
    await typeInto(nameField(), 'Acme Marketing');
    expect(nameField().value).toBe('Acme Marketing');

    workspace.patchTeam('team-1', { role: 'admin' });
    await renderWithCurrentWorkspace();

    expect(nameField().value).toBe('Acme Marketing');
    expect(slugField().value).toBe('acme');
  });

  it("keeps a typed slug when a focus refetch brings a teammate's rename, and the untouched name follows the rename", async () => {
    await mount();
    await typeInto(slugField(), 'acme-mkt');

    workspace.active = acme({ name: 'Acme Group' });
    await renderWithCurrentWorkspace();

    expect(slugField().value).toBe('acme-mkt');
    expect(nameField().value).toBe('Acme Group');
  });

  it('keeps a cleared slug as the user left it', async () => {
    await mount();
    await typeInto(slugField(), '');

    workspace.active = acme();
    await renderWithCurrentWorkspace();

    expect(slugField().value).toBe('');
  });

  it('loads the other Organization when the user switches to it', async () => {
    await mount();
    await typeInto(nameField(), 'Acme Marketing');

    workspace.active = acme({ id: 'team-2', teamId: 'team-2', name: 'Globex', slug: 'globex' });
    queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-2'), []);
    queryClient.setQueryData(queryKeys.teamInvites('user-1', 'team-2'), []);
    queryClient.setQueryData(queryKeys.teamActivity('user-1', 'team-2'), []);
    await renderWithCurrentWorkspace();

    expect(nameField().value).toBe('Globex');
    expect(slugField().value).toBe('globex');
  });

  it('shows what the server saved after Save, even when it adjusted the slug, leaving nothing to save', async () => {
    workspace.updateTeam.mockResolvedValue({
      success: true,
      team: {
        id: 'team-1',
        name: 'Acme Marketing',
        slug: 'acme-mkt-2',
        created_at: '2026-01-01T00:00:00.000Z',
        created_by_user_id: 'user-1',
        membership: { id: 'member-1', status: 'active', role: 'owner' },
      },
    });
    await mount();
    await typeInto(nameField(), ' Acme Marketing ');
    await typeInto(slugField(), 'acme-mkt');

    const form = findAll(container, (node) => node.nodeName === 'FORM').find((node) =>
      findAll(node, (entry) => entry === nameField()).length > 0,
    );
    if (!form) throw new Error('No Organization settings form');
    await act(async () => {
      dispatch(container, form, 'submit');
    });
    await renderWithCurrentWorkspace();

    expect(workspace.updateTeam).toHaveBeenCalledWith('team-1', { name: 'Acme Marketing', slug: 'acme-mkt' });
    expect(nameField().value).toBe('Acme Marketing');
    expect(slugField().value).toBe('acme-mkt-2');
    expect(saveButton().getAttribute('disabled')).not.toBeNull();
  });
});
