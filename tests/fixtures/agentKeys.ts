import type { AgentKey } from '@/lib/api';

export const ACTIVE_AGENT_KEY: AgentKey = {
  id: 'key-1',
  name: 'Codex SOP Runner',
  prefix: 'slrk_demo12',
  createdAt: '2026-09-19T01:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
  permissions: ['templates:read', 'runs:read', 'runs:write'],
  status: 'active',
};
