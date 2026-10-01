import { expect, vi } from 'vitest';
import { dbMocks } from './mockedDrizzleD1';
import { z } from 'zod';
import { type Entitlements, getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from './apiEnv';
import { EVERY_GUARDED_WRITE_APPLIED, resetChainsToEmptyResults } from './drizzleChainMocks';
import { FREE_PLAN } from '../fixtures/plans';
import { readJson } from './readJson';

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

export { dbMocks } from './mockedDrizzleD1';

export const mockEnv = apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' });

export { FREE_PLAN, PRO_PLAN, TEAM_PLAN } from '../fixtures/plans';

export { EVERY_GUARDED_WRITE_APPLIED } from './drizzleChainMocks';

export function resetToASignedOutVisitorOnTheFreePlan() {
  vi.clearAllMocks();
  resetChainsToEmptyResults(dbMocks);

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

export const successBody = z.object({ success: z.boolean() }).passthrough();

export async function expectSuccessUpdating(response: Response, columns: Record<string, unknown>) {
  const data = await readJson(response, successBody);

  expect(response.status).toBe(200);
  expect(data.success).toBe(true);
  expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining(columns));
}

export function expectTheOrganizationPlanChecked() {
  expect(vi.mocked(getEntitlementsForContext)).toHaveBeenCalledWith(
    mockEnv,
    expect.objectContaining({ type: 'team', teamId: 'team-1', userId: 'user-123' }),
  );
}

export function expectTheOrganizationOwnsIt(inserted: Record<string, unknown>) {
  expect(inserted.owner_type).toBe('team');
  expect(inserted.team_id).toBe('team-1');
  expect(inserted.created_by_user_id).toBe('user-123');
}
