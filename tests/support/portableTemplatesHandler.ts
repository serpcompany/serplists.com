import { vi } from 'vitest';
import { dbMocks } from './templatesApiMocks';
import { z } from 'zod';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { chainSelectsUpdatesAndDeletes } from './drizzleChainMocks';
import { handleTemplates } from '@functions/api/handlers/templates';
import { mockEnv } from './templatesApiMocks';

export { dbMocks, mockEnv } from './templatesApiMocks';

const exportedTemplate = z
  .object({
    title: z.string(),
    sections: z.array(z.object({ items: z.array(z.record(z.unknown())) }).passthrough()),
  })
  .passthrough();
export const packBody = z.object({ templates: z.array(exportedTemplate), manifest: z.record(z.unknown()) }).passthrough();
export const importBody = z.object({ imported: z.number() }).passthrough();

export function resetPortableTemplatesHandlerMocks() {
  vi.clearAllMocks();
  chainSelectsUpdatesAndDeletes(dbMocks);
  dbMocks.selectChain.orderBy.mockResolvedValue([]);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockResolvedValue(undefined);
  dbMocks.db.batch.mockResolvedValue([]);

  vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  vi.mocked(getEntitlementsForUser).mockResolvedValue({
    plan: 'pro',
    limits: { maxTemplates: null, maxActiveRuns: null },
  });
  vi.mocked(getEntitlementsForContext).mockResolvedValue({
    plan: 'team',
    limits: { maxTemplates: null, maxActiveRuns: null },
  });
}

export const importPack = (templates: unknown[]) =>
  handleTemplates(
    new Request('http://localhost/api/templates/backup', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'serplists-template-pack',
        schemaVersion: '2.0.0',
        exportedAt: '2026-03-21T00:00:00.000Z',
        templates,
      }),
    }),
    mockEnv,
  );
