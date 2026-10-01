import { memoryAdapter } from 'better-auth/adapters/memory';
import { vi } from 'vitest';

const inMemoryAuth = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: () => memoryAdapter(inMemoryAuth.tables),
}));

vi.mock('@functions/api/db', () => ({
  createDb: vi.fn(() => ({})),
  schema: {},
}));

export { inMemoryAuth };

export function emptyTheAuthTables() {
  inMemoryAuth.tables = { users: [], session: [], account: [], verification: [] };
}
