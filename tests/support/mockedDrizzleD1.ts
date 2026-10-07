import { vi } from 'vitest';
import { drizzleChainMocks } from './drizzleChainMocks';

export const dbMocks = drizzleChainMocks();

vi.mock('drizzle-orm/d1', () => ({ drizzle: vi.fn(() => dbMocks.db) }));
