import { vi } from 'vitest';

const teamSettingsServer = vi.hoisted(() => ({
  acceptIncomingTeamInvite: vi.fn(),
  getIncomingTeamInvites: vi.fn(),
  getTeams: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    ...teamSettingsServer,
    getBillingStatus: vi.fn().mockResolvedValue({ billingEnabled: true, plan: 'free' }),
    getTeamActivity: vi.fn().mockResolvedValue([]),
    getTeamInvites: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
  },
}));
const signedInSession = vi.hoisted(() => ({
  isLoading: false,
  sessionStatus: 'authenticated',
  user: { id: 'user-1' },
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => signedInSession,
}));

export { teamSettingsServer };
