import { vi } from 'vitest';

import './mockedToasts';

const runKeysServer = vi.hoisted(() => ({
  createAgentKey: vi.fn(),
  getAgentKeys: vi.fn(),
  getAgentMcpConnection: vi.fn(),
  revokeAgentKey: vi.fn(),
}));

vi.mock('@/contexts/CloudflareAuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: runKeysServer,
}));

export { runKeysServer };
