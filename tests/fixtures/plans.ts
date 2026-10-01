import type { Entitlements } from '@functions/api/utils/entitlements';

export const FREE_PLAN: Entitlements = { plan: 'free', limits: { maxTemplates: 1, maxActiveRuns: 3 } };
export const PRO_PLAN: Entitlements = { plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } };
export const TEAM_PLAN: Entitlements = { plan: 'team', limits: { maxTemplates: null, maxActiveRuns: null } };
