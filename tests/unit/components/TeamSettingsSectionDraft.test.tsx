import React, { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSettingsSection } from '@/components/account/TeamSettingsSection';
import { queryKeys } from '@/lib/queryKeys';

import { createFakeContainer, FakeElement, findAll, installFakeDomGlobals, type FakeNode } from '../../fixtures/fakeDom';

// The Organization name and slug fields in Settings. WorkspaceContext rebuilds the active
// workspace object whenever the Organizations list changes (Make owner patches the role, a
// focus refetch picks up a change to any of the user's Organizations), so a form that reset
// on every new object dropped what the user was typing. Drives the real section; only the
// workspace context, the API, toasts and the Radix select are faked.

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
vi.mock('@/components/ui/select', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return { Select: Pass, SelectContent: () => null, SelectItem: Pass, SelectTrigger: Pass, SelectValue: () => null };
});
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

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
let container: FakeElement;
let queryClient: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  workspace.active = acme();
  workspace.refreshTeams.mockResolvedValue(undefined);
  // The real patchTeam rebuilds the active workspace from the patched list.
  workspace.patchTeam.mockImplementation((_teamId: string, patch: Partial<TeamWorkspace>) => {
    workspace.active = { ...workspace.active, ...patch };
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-1'), []);
  queryClient.setQueryData(queryKeys.teamInvites('user-1', 'team-1'), []);
  queryClient.setQueryData(queryKeys.teamActivity('user-1', 'team-1'), []);
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  queryClient.clear();
});

// Renders again, as the context does when its value changes.
const render = async () => {
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
  root = createRoot(container as unknown as Element);
  await render();
};

const byId = (id: string) => {
  const [node] = findAll(container, (entry) => entry instanceof FakeElement && entry.getAttribute('id') === id);
  if (!node) throw new Error(`No element with id ${id}`);
  return node as FakeElement & { value?: string };
};

const nameField = () => byId('team-settings-name');
const slugField = () => byId('team-settings-slug');

const dispatch = (type: string, target: FakeNode) => {
  const event = {
    type,
    target,
    defaultPrevented: false,
    timeStamp: Date.now(),
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
  };
  for (const entry of container.listeners.filter((listener) => listener.type === type)) {
    entry.listener(event);
  }
};

// Typing: React DOM loaded without a DOM listens for the old IE input events, so call the
// field's own onChange (the props React keeps on the node) with the typed value.
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

describe('TeamSettingsSection Organization name and slug', () => {
  it('keeps a typed name when Make owner patches the role', async () => {
    await mount();
    await typeInto(nameField(), 'Acme Marketing');
    expect(nameField().value).toBe('Acme Marketing');

    // Make owner: patchTeam(teamId, { role: 'admin' }) gives a new active workspace object.
    workspace.patchTeam('team-1', { role: 'admin' });
    await render();

    expect(nameField().value).toBe('Acme Marketing');
    expect(slugField().value).toBe('acme');
  });

  it('keeps a typed slug when a refetch rebuilds the workspace, and a clean name follows a rename', async () => {
    await mount();
    await typeInto(slugField(), 'acme-mkt');

    // A focus refetch: a teammate renamed this Organization.
    workspace.active = acme({ name: 'Acme Group' });
    await render();

    expect(slugField().value).toBe('acme-mkt');
    expect(nameField().value).toBe('Acme Group');
  });

  it('keeps a cleared slug as the user left it', async () => {
    await mount();
    await typeInto(slugField(), '');

    workspace.active = acme();
    await render();

    expect(slugField().value).toBe('');
  });

  it('loads the other Organization when the user switches to it', async () => {
    await mount();
    await typeInto(nameField(), 'Acme Marketing');

    workspace.active = acme({ id: 'team-2', teamId: 'team-2', name: 'Globex', slug: 'globex' });
    queryClient.setQueryData(queryKeys.teamMembers('user-1', 'team-2'), []);
    queryClient.setQueryData(queryKeys.teamInvites('user-1', 'team-2'), []);
    queryClient.setQueryData(queryKeys.teamActivity('user-1', 'team-2'), []);
    await render();

    expect(nameField().value).toBe('Globex');
    expect(slugField().value).toBe('globex');
  });

  it('shows what the server saved after Save, even when it adjusted the slug', async () => {
    workspace.updateTeam.mockResolvedValue({ team: { id: 'team-1', name: 'Acme Marketing', slug: 'acme-mkt-2' } });
    await mount();
    await typeInto(nameField(), ' Acme Marketing ');
    await typeInto(slugField(), 'acme-mkt');

    const form = findAll(container, (node) => node.nodeName === 'FORM').find((node) =>
      findAll(node, (entry) => entry === nameField()).length > 0,
    );
    if (!form) throw new Error('No Organization settings form');
    await act(async () => {
      dispatch('submit', form);
    });
    await render();

    expect(workspace.updateTeam).toHaveBeenCalledWith('team-1', { name: 'Acme Marketing', slug: 'acme-mkt' });
    expect(nameField().value).toBe('Acme Marketing');
    expect(slugField().value).toBe('acme-mkt-2');
    // Nothing left to save.
    expect(saveButton().getAttribute('disabled')).not.toBeNull();
  });
});
