import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiErrorBody, jsonObject, readJson } from '../../../support/readJson';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';

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

const guardedInserts = vi.hoisted(() => [] as Array<{ values: Record<string, unknown>; condition: unknown }>);

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
    insertRowWhere: vi.fn((_db: unknown, _table: unknown, values: Record<string, unknown>, condition: unknown) => {
      guardedInserts.push({ values, condition });
      return { guardedInsert: values.action };
    }),
  };
});

import { handleChecklists } from '@functions/api/handlers/checklists';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
const dialect = new SQLiteSyncDialect();

function sharedRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'user-123',
    team_id: null,
    template_id: 'template-1',
    title: 'Run',
    items: JSON.stringify([{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: true }] }]),
    retired_items: '[]',
    status: 'in_progress',
    progress: 100,
    template_version: 1,
    revision: 4,
    is_public: true,
    share_token: 'leaked-token',
    share_expires_at: '2026-01-01T00:00:00.000Z',
    share_used_at: null,
    deleted_at: null,
    ...overrides,
  };
}

async function stopSharing(runId = 'run-1') {
  const response = await handleChecklists(new Request(`http://localhost/api/checklists/run/${runId}/share`, {
    method: 'DELETE',
  }), env);
  return { response, data: await readJson(response, jsonObject) };
}

function sqlText(condition: unknown): string {
  return dialect.sqlToQuery(condition as SQL).sql;
}

describe('stopping a run share, which makes the run private and ends its old link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    guardedInserts.length = 0;
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
  });

  it('makes the owner\'s run private and clears every share field, leaving the revision so open run pages keep saving', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const { response, data } = await stopSharing();

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: 'run-1', isPublic: false });
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      is_public: false,
      share_token: null,
      share_expires_at: null,
      share_used_at: null,
    }));
    expect(dbMocks.updateChain.set.mock.calls[0][0]).not.toHaveProperty('revision');
    const updateWhere = sqlText(dbMocks.updateChain.where.mock.calls[0][0]);
    expect(updateWhere).toContain('"is_public" = ?');
    expect(updateWhere).toContain('"deleted_at" is null');
    expect(updateWhere).toContain('"user_id" = ?');
  });

  it('writes a share_revoked audit event only while the run is still shared, before the update so its guard sees the shared row', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    await stopSharing();

    expect(guardedInserts).toHaveLength(1);
    expect(guardedInserts[0].values).toEqual(expect.objectContaining({
      action: 'checklist_run.share_revoked',
      resource_type: 'checklist_run',
      resource_id: 'run-1',
      actor_user_id: 'user-123',
    }));
    expect(JSON.stringify(guardedInserts[0].values)).not.toContain('leaked-token');
    expect(sqlText(guardedInserts[0].condition)).toContain('"is_public" = ?');
    const [firstStatement] = dbMocks.db.batch.mock.calls[0][0] as unknown[];
    expect(firstStatement).toEqual({ guardedInsert: 'checklist_run.share_revoked' });
  });

  it('lets an Organization runner stop sharing an Organization run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ user_id: 'creator-1', team_id: 'team-1' })])
      .mockResolvedValueOnce([{ id: 'm-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }])
      .mockResolvedValueOnce([{ id: 'm-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }]);

    const { response } = await stopSharing();

    expect(response.status).toBe(200);
    expect(sqlText(dbMocks.updateChain.where.mock.calls[0][0])).toContain('"team_id" = ?');
  });

  it('refuses an Organization viewer', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ user_id: 'creator-1', team_id: 'team-1' })])
      .mockResolvedValueOnce([{ id: 'm-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' }])
      .mockResolvedValueOnce([{ id: 'm-1', team_id: 'team-1', user_id: 'user-123', role: 'viewer', status: 'active' }]);

    const { response } = await stopSharing();

    expect(response.status).toBe(403);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('hides another user\'s Personal run and archived runs', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({ user_id: 'other-user' })]);
    expect((await stopSharing()).response.status).toBe(404);

    dbMocks.selectChain.limit.mockResolvedValueOnce([]);
    expect((await stopSharing()).response.status).toBe(404);

    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('is a no-op for a run that is not shared', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun({ is_public: false, share_token: null })]);

    const { response, data } = await stopSharing();

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: 'run-1', isPublic: false });
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('reports success when a concurrent request already stopped sharing', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const { response, data } = await stopSharing();

    expect(response.status).toBe(200);
    expect(data).toEqual({ id: 'run-1', isPublic: false });
  });

  it('points revalidation of a shared run at Stop sharing', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 4 }),
    }), env);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('shared_run_conflict');
    expect(data.error).toMatch(/stop sharing/i);
  });
});
