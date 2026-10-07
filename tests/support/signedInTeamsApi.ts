import { vi } from 'vitest';

const teamsApi = vi.hoisted(() => ({ getTeams: vi.fn() }));

vi.mock('@/lib/api', () => ({ api: teamsApi }));
vi.mock('@/contexts/CloudflareAuthContext', () => ({
  useAuth: () => ({ isLoading: false, sessionStatus: 'authenticated', user: { id: 'user-1' } }),
}));

export { teamsApi };
