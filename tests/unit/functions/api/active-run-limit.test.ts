import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';

const dbMocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  return { selectChain, db: { select: vi.fn(() => selectChain) } };
});

vi.mock('drizzle-orm/d1', () => ({ drizzle: vi.fn(() => dbMocks.db) }));
vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));

import {
  activeRunsInContext,
  findActiveRunLimitHit,
  isReopening,
} from '@functions/api/utils/active-run-limit';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';

const env = { DB: {} } as any;
const free = { plan: 'free' as const, limits: { maxTemplates: 1, maxActiveRuns: 3 } };

describe('isReopening', () => {
  it.each([
    ['completed', 'in_progress', true],
    [null, 'in_progress', true],
    ['in_progress', 'in_progress', false],
    ['completed', 'completed', false],
    ['in_progress', 'completed', false],
    ['completed', undefined, false],
  ])('%s -> %s is %s', (current, next, expected) => {
    expect(isReopening(current, next)).toBe(expected);
  });
});

describe('findActiveRunLimitHit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    vi.mocked(getEntitlementsForUser).mockResolvedValue(free);
    vi.mocked(getEntitlementsForContext).mockResolvedValue(free);
  });

  it('reports the limit when a Free Personal context is full', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 3 }]);
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: null }, 'actor')).toEqual({ limit: 3, current: 3 });
    expect(getEntitlementsForUser).toHaveBeenCalledWith(env, 'owner');
  });

  it('allows one more run below the limit', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 2 }]);
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: null })).toBeNull();
  });

  it('uses the Organization plan for Organization runs', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ count: 5 }]);
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: 'org-1' }, 'actor')).toEqual({ limit: 3, current: 5 });
    expect(getEntitlementsForContext).toHaveBeenCalledWith(env, { type: 'team', teamId: 'org-1', userId: 'actor' });
    expect(getEntitlementsForUser).not.toHaveBeenCalled();
  });

  it('skips the count on plans without a limit', async () => {
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
    expect(await findActiveRunLimitHit(env, { userId: 'owner', teamId: null })).toBeNull();
    expect(dbMocks.db.select).not.toHaveBeenCalled();
  });
});

describe('activeRunsInContext', () => {
  const render = (owner: { userId: string; teamId: string | null }) =>
    new SQLiteSyncDialect().sqlToQuery(activeRunsInContext(owner));

  it('counts an Organization\'s in-progress runs by Organization only', () => {
    const query = render({ userId: 'owner', teamId: 'org-1' });
    expect(query.sql).not.toContain('"user_id"');
    expect(query.params).toEqual(['org-1', 'in_progress']);
  });

  it('counts a Personal context by owner outside any Organization', () => {
    const query = render({ userId: 'owner', teamId: null });
    expect(query.sql).toContain('"team_id" is null');
    expect(query.params).toEqual(['owner', 'in_progress']);
  });
});
