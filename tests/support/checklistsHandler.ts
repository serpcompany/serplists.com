import { vi } from 'vitest';
import { z } from 'zod';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from './apiEnv';

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
  };
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const deleteChain = {
    where: vi.fn(),
  };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, updateChain, deleteChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) =>
  (await import('./guardedInserts')).guardedInsertsThroughThePlainInsertMock(importOriginal));

export { dbMocks };

export const mockEnv = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });

export const runBody = z.object({ id: z.string() }).passthrough();
export const successBody = z.object({ success: z.boolean() }).passthrough();

export function resetChecklistsHandlerMocks() {
  vi.clearAllMocks();
  dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
  dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
  dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
  dbMocks.selectChain.orderBy.mockResolvedValue([]);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockResolvedValue(undefined);
  dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
  dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
  dbMocks.deleteChain.where.mockResolvedValue(undefined);
  dbMocks.db.batch.mockResolvedValue([]);

  vi.mocked(getSessionUserId).mockResolvedValue(null);
  vi.mocked(getEntitlementsForUser).mockResolvedValue({
    plan: 'free',
    limits: { maxTemplates: 1, maxActiveRuns: 3 },
  });
  vi.mocked(getEntitlementsForContext).mockResolvedValue({
    plan: 'free',
    limits: { maxTemplates: 1, maxActiveRuns: 3 },
  });
}
