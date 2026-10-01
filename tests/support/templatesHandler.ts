import { vi } from 'vitest';
import { z } from 'zod';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from './apiEnv';
import { chainSelectsUpdatesAndDeletes, drizzleChainMocks } from './drizzleChainMocks';

export const dbMocks = drizzleChainMocks();

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

export const mockEnv = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });

export function resetTemplatesHandlerMocks() {
  vi.clearAllMocks();
  chainSelectsUpdatesAndDeletes(dbMocks);
  dbMocks.selectChain.orderBy.mockResolvedValue([]);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockResolvedValue(undefined);
  dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
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

export const createdBody = z.object({ id: z.string() }).passthrough();
export const slugBody = z.object({ slug: z.string() }).passthrough();
export const successBody = z.object({ success: z.boolean() }).passthrough();
export const importBody = z
  .object({
    imported: z.number(),
    failed: z.array(z.object({ index: z.number(), code: z.string(), reason: z.string() }).passthrough()),
  })
  .passthrough();
