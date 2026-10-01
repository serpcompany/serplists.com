import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { queryKeys } from '@/lib/queryKeys';

import { createFakeContainer, dispatch, FakeElement, findAll } from '../../fixtures/fakeDom';
import { aFakeDomForEachTest } from '../../support/fakeDomRoots';

type TeamWorkspace = {
  id: string;
  teamId: string;
  type: 'team';
  memberId: string;
  name: string;
  role: 'owner' | 'admin';
  slug: string | null;
};

const workspace = vi.hoisted(() => ({
  active: null as unknown as TeamWorkspace,
  patchTeam: vi.fn(),
  refreshTeams: vi.fn(),
  updateTeam: vi.fn(),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'owner@example.com' } }),
}));
vi.mock('@/contexts/WorkspaceContext', () => ({
  useWorkspace: () => ({
    activeTeamId: workspace.active.teamId,
    activeWorkspace: workspace.active,
    canManageTeam: true,
    createTeam: vi.fn(),
    isTeamWorkspace: true,
    patchTeam: workspace.patchTeam,
    refreshTeams: workspace.refreshTeams,
    rememberTeam: vi.fn(),
    selectWorkspace: vi.fn(),
    teams: [workspace.active],
  }),
}));
vi.mock('@/lib/api', () => ({
  api: {
    getTeamActivity: vi.fn().mockResolvedValue([]),
    getTeamInvites: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
    updateTeam: (...args: unknown[]) => workspace.updateTeam(...args),
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
  workspace.active = { ...workspace.active, ...patch };
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
  if (!node) throw new Error(`No element with id ${id}`);
  return node as FakeElement & { value?: string };
};

const nameField = () => byId('team-settings-name');
const slugField = () => byId('team-settings-slug');

const typeInto = async (field: FakeElement, value: string) => {
  const propsKey = Object.keys(field).find((key) => key.startsWith('__reactProps$'));
  const props = propsKey ? (field as unknown as Record<string, { onChange?: (event: unknown) => void }>)[propsKey] : null;
  if (!props?.onChange) throw new Error('The field has no onChange');
  await act(async () => {
    props.onChange?.({ target: { value }, currentTarget: { value } });
  });
};

const saveButton = () => {
  const [button] = findAll(
    container,
    (node) => node.nodeName === 'BUTTON' && node.textContent.startsWith('Sav'),
  );
  if (!button) throw new Error('No Save Organization button');
  return button as FakeElement;
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
    workspace.updateTeam.mockResolvedValue({ team: { id: 'team-1', name: 'Acme Marketing', slug: 'acme-mkt-2' } });
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
