import { vi } from 'vitest';
import { z } from 'zod';

export {
  dbMocks,
  expectSuccessUpdating,
  expectTheOrganizationOwnsIt,
  expectTheOrganizationPlanChecked,
  mockEnv,
  PRO_PLAN,
  resetToASignedOutVisitorOnTheFreePlan as resetTemplatesHandlerMocks,
  successBody,
  TEAM_PLAN,
} from './apiHandlerMocks';

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) =>
  (await import('./guardedInserts')).guardedInsertsThroughThePlainInsertMock(importOriginal));

export const createdBody = z.object({ id: z.string(), slug: z.unknown() }).passthrough();
export const slugBody = z.object({ slug: z.string() }).passthrough();
export const importBody = z
  .object({
    imported: z.number(),
    total: z.unknown(),
    successes: z.unknown(),
    failed: z.array(z.object({ index: z.number(), code: z.string(), reason: z.string() }).passthrough()),
  })
  .passthrough();
