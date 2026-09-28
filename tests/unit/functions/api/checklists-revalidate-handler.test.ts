import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';

// POST /api/checklists/:id/revalidate copies the source template's current content into a
// run, so it must apply the same source rule as run creation: public, the caller's own
// Personal template, or a template of the run's own Organization.

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = { values: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  const db = {
    select: vi.fn((_fields?: unknown) => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, updateChain, db };
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

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@functions/api/utils/guarded-insert')>();
  return {
    ...actual,
    // Guarded audit inserts go through the plain insert mock so tests can inspect the row;
    // the guards themselves are covered in audit-guards.test.ts and the local D1 tests.
    insertRowWhere: vi.fn((db: any, table: unknown, values: unknown) => db.insert(table).values(values)),
  };
});

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForContext, getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
const membership = { id: 'member-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' };

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    title: 'Run',
    items: JSON.stringify([{ id: 'section-1', title: 'Old', items: [{ id: 'item-1', title: 'Old', isCompleted: true }] }]),
    retired_items: '[]',
    status: 'in_progress',
    template_version: 1,
    revision: 2,
    is_public: false,
    ...overrides,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 'template-1',
    version: 3,
    items: JSON.stringify([{ id: 'section-1', title: 'Private', items: [{ id: 'item-1', title: 'Confidential step' }] }]),
    owner_type: 'user',
    team_id: null,
    user_id: 'user-123',
    is_public: false,
    ...overrides,
  };
}

async function revalidate() {
  const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
    method: 'POST',
    body: JSON.stringify({ expected_revision: 2 }),
  }), env);
  return { response, data: await response.json() as Record<string, unknown> };
}

function expectNothingWritten() {
  expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
}

describe('run revalidation source access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'pro', limits: { maxTemplates: null, maxActiveRuns: null } });
    vi.mocked(getEntitlementsForContext).mockResolvedValue({ plan: 'team', limits: { maxTemplates: null, maxActiveRuns: null } });
  });

  it('refuses another user\'s private Personal template for a Personal run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([template({ user_id: 'other-user' })]);

    const { response, data } = await revalidate();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Source template not found');
    expect(JSON.stringify(data)).not.toContain('Confidential');
    expectNothingWritten();
  });

  it('refuses another member\'s private Personal template for an Organization run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run({ team_id: 'team-1', user_id: 'other-user' })])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([template({ user_id: 'other-user' })]);

    const { response } = await revalidate();

    expect(response.status).toBe(404);
    expectNothingWritten();
  });

  it('refuses a private Organization template for a Personal run, even for a member', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run()])
      .mockResolvedValueOnce([template({ owner_type: 'team', team_id: 'team-1', user_id: 'other-user' })]);

    const { response } = await revalidate();

    expect(response.status).toBe(404);
    expectNothingWritten();
  });

  it('refuses another Organization\'s private template for an Organization run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([run({ team_id: 'team-1' })])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([membership])
      .mockResolvedValueOnce([template({ owner_type: 'team', team_id: 'team-2', user_id: 'other-user' })]);

    const { response } = await revalidate();

    expect(response.status).toBe(404);
    expectNothingWritten();
  });

  it.each([
    ['another user\'s public template', {}, { user_id: 'other-user', is_public: true }],
    ['a public template stored as 1', {}, { user_id: 'other-user', is_public: 1 }],
    ['the caller\'s own private Personal template', {}, {}],
    ['the caller\'s own Personal template for an Organization run', { team_id: 'team-1' }, {}],
    ['a private template of the run\'s Organization', { team_id: 'team-1' }, { owner_type: 'team', team_id: 'team-1', user_id: 'other-user' }],
  ])('reconciles from %s', async (_label, runOverrides, templateOverrides) => {
    const teamRun = 'team_id' in runOverrides;
    dbMocks.selectChain.limit.mockResolvedValueOnce([run(runOverrides)]);
    if (teamRun) {
      dbMocks.selectChain.limit.mockResolvedValueOnce([membership]).mockResolvedValueOnce([membership]);
    }
    dbMocks.selectChain.limit.mockResolvedValueOnce([template(templateOverrides)]);

    const { response, data } = await revalidate();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ success: true, template_version: 3 }));
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });
});

describe('run staleness only counts sources the caller may use', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  });

  it('checks visibility and archive state in the current_template_version subquery', async () => {
    await handleChecklists(new Request('http://localhost/api/checklists', { method: 'GET' }), env);

    const fields = dbMocks.db.select.mock.calls[0][0] as { current_template_version: SQL };
    const query = new SQLiteSyncDialect().sqlToQuery(fields.current_template_version);
    expect(query.sql).toMatch(/deleted_at" is null/i);
    expect(query.sql).toMatch(/is_public" = 1/i);
    expect(query.sql).toMatch(/"checklist_runs"\."team_id"/);
    expect(query.params).toContain('user-123');
  });
});
