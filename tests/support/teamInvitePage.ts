import { vi } from 'vitest';

type InviteeAuth = {
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<{ ok: boolean }>;
  user: { id: string; email: string } | null;
};

const signedInInvitee = (): InviteeAuth => ({
  isAuthenticated: true,
  isLoading: false,
  logout: vi.fn(async () => ({ ok: true })),
  user: { id: 'user-1', email: 'invitee@example.com' },
});

const authListeners = new Set<() => void>();
let authState = signedInInvitee();

export const inviteeAuth = {
  get: () => authState,
  set: (next: Partial<InviteeAuth>) => {
    authState = { ...authState, ...next };
    authListeners.forEach((listener) => listener());
  },
  reset: () => {
    authState = signedInInvitee();
  },
  subscribe: (listener: () => void) => {
    authListeners.add(listener);
    return () => {
      authListeners.delete(listener);
    };
  },
};

export const workspaceMocks = {
  refreshTeams: vi.fn(async () => []),
  rememberTeam: vi.fn(),
  selectWorkspace: vi.fn(),
};

export const apiMocks = {
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
  getTeamInvitePreview: vi.fn(),
};

vi.mock('@/contexts/CloudflareAuthContext', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useAuth: () => useSyncExternalStore(inviteeAuth.subscribe, inviteeAuth.get, inviteeAuth.get) };
});
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => workspaceMocks }));
vi.mock('@/lib/api', () => ({ api: apiMocks }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

export const PENDING_INVITE_PREVIEW = {
  status: 'pending' as const,
  teamId: 'team-1',
  teamName: 'Acme Corp',
  teamSlug: 'acme-corp',
  role: 'editor' as const,
  expiresAt: '2026-10-05T00:00:00.000Z',
  inviterName: 'Owner User',
  inviterEmail: 'owner@example.com',
};
