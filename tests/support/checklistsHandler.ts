import { vi } from 'vitest';
import { z } from 'zod';

export {
  dbMocks,
  EVERY_GUARDED_WRITE_APPLIED,
  FREE_PLAN,
  mockEnv,
  PRO_PLAN,
  resetToASignedInUser,
  resetToASignedOutVisitorOnTheFreePlan as resetChecklistsHandlerMocks,
  TEAM_PLAN,
} from './apiHandlerMocks';

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) =>
  (await import('./guardedInserts')).guardedInsertsThroughThePlainInsertMock(importOriginal));

export const runBody = z.object({ id: z.string() }).passthrough();
export const successBody = z.object({ success: z.boolean() }).passthrough();
