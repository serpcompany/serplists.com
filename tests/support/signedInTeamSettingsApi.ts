import { vi } from 'vitest';

const teamSettingsServer = vi.hoisted(() => ({
  acceptIncomingTeamInvite: vi.fn(),
  getIncomingTeamInvites: vi.fn(),
  getTeams: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    ...teamSettingsServer,
    getTeamActivity: vi.fn().mockResolvedValue([]),
    getTeamInvites: vi.fn().mockResolvedValue([]),
    getTeamMembers: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: 'user-1' } }),
}));

export { teamSettingsServer };
