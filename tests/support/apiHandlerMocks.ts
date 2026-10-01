import { vi } from 'vitest';
import { type Entitlements, getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from './apiEnv';
import { chainSelectsUpdatesAndDeletes } from './drizzleChainMocks';
import { dbMocks } from './mockedDrizzleD1';

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

export { dbMocks } from './mockedDrizzleD1';

export const mockEnv = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });

export const FREE_PLAN: Entitlements = { plan: 'free', limits: { maxTemplates: 1, maxActiveRuns: 3 } };
export const PRO_PLAN: Entitlements = { plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } };
export const TEAM_PLAN: Entitlements = { plan: 'team', limits: { maxTemplates: null, maxActiveRuns: null } };

export const EVERY_GUARDED_WRITE_APPLIED = [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];

export function resetToASignedOutVisitorOnTheFreePlan() {
  vi.clearAllMocks();
  for (const queue of [dbMocks.selectChain.orderBy, dbMocks.selectChain.limit, dbMocks.db.batch]) queue.mockReset();
  chainSelectsUpdatesAndDeletes(dbMocks);
  dbMocks.selectChain.orderBy.mockResolvedValue([]);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockResolvedValue(undefined);
  dbMocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
  dbMocks.deleteChain.where.mockResolvedValue(undefined);
  dbMocks.db.batch.mockResolvedValue([]);

  vi.mocked(getSessionUserId).mockResolvedValue(null);
  vi.mocked(getEntitlementsForUser).mockResolvedValue(FREE_PLAN);
  vi.mocked(getEntitlementsForContext).mockResolvedValue(FREE_PLAN);
}

export function resetToASignedInUser(userId: string, personalPlan: Entitlements, organizationPlan: Entitlements = personalPlan) {
  resetToASignedOutVisitorOnTheFreePlan();
  dbMocks.db.batch.mockResolvedValue(EVERY_GUARDED_WRITE_APPLIED);
  signInWithPlans(userId, personalPlan, organizationPlan);
}

export function signInWithPlans(userId: string, personalPlan: Entitlements, organizationPlan: Entitlements = personalPlan) {
  vi.mocked(getSessionUserId).mockResolvedValue(userId);
  vi.mocked(getEntitlementsForUser).mockResolvedValue(personalPlan);
  vi.mocked(getEntitlementsForContext).mockResolvedValue(organizationPlan);
}
