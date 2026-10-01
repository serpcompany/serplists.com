import { memoryAdapter } from 'better-auth/adapters/memory';
import { vi } from 'vitest';

type AuthRow = Record<string, unknown>;
type AuthTables = { users: AuthRow[]; session: AuthRow[]; account: AuthRow[]; verification: AuthRow[] };

const inMemoryAuth = vi.hoisted((): { tables: AuthTables } => ({
  tables: { users: [], session: [], account: [], verification: [] },
}));

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
