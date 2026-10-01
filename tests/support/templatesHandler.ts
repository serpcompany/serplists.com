import { vi } from 'vitest';
import { dbMocks } from './templatesApiMocks';
import { z } from 'zod';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { chainSelectsUpdatesAndDeletes } from './drizzleChainMocks';

export { dbMocks, mockEnv } from './templatesApiMocks';

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) =>
  (await import('./guardedInserts')).guardedInsertsThroughThePlainInsertMock(importOriginal));

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
