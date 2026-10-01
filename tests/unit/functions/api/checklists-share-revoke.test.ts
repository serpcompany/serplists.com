import { describe, it, expect, beforeEach } from 'vitest';
import { firstOf } from '../../../support/elements';
import { dbMocks, mockEnv, PRO_PLAN, resetToASignedInUser } from '../../../support/apiHandlerMocks';
import { guardedInserts } from '../../../support/recordedGuardedInserts';
import { personalRunRow } from '../../../fixtures/handlerRows';
import { apiRequest } from '../../../support/apiRequest';
import { apiErrorBody, jsonObject, readJson } from '../../../support/readJson';
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core';
import type { SQL } from 'drizzle-orm';

import { handleChecklists } from '@functions/api/handlers/checklists';

const dialect = new SQLiteSyncDialect();

function sharedRun(overrides: Record<string, unknown> = {}) {
  return personalRunRow({
    template_id: 'template-1',
    items: JSON.stringify([{ id: 'section-1', title: 'S', items: [{ id: 'item-1', title: 'Task', isCompleted: true }] }]),
    retired_items: '[]',
    progress: 100,
    template_version: 1,
    revision: 4,
    is_public: true,
    share_token: 'leaked-token',
    share_expires_at: '2026-01-01T00:00:00.000Z',
    share_used_at: null,
    deleted_at: null,
    ...overrides,
  });
}

async function stopSharing(runId = 'run-1') {
  const response = await handleChecklists(apiRequest(`checklists/run/${runId}/share`, 'DELETE'), mockEnv);
  return { response, data: await readJson(response, jsonObject) };
}

async function expectStoppedPrivately() {
  const { response, data } = await stopSharing();

  expect(response.status).toBe(200);
  expect(data).toEqual({ id: 'run-1', isPublic: false });
}

function sqlText(condition: unknown): string {
  return dialect.sqlToQuery(condition as SQL).sql;
}

describe('stopping a run share, which makes the run private and ends its old link', () => {
  beforeEach(() => {
    resetToASignedInUser('user-123', PRO_PLAN);
    guardedInserts.length = 0;
  });

  it('makes the owner\'s run private and clears every share field, leaving the revision so open run pages keep saving', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    await expectStoppedPrivately();
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      is_public: false,
      share_token: null,
      share_expires_at: null,
      share_used_at: null,
    }));
    expect(firstOf(dbMocks.updateChain.set.mock.calls)[0]).not.toHaveProperty('revision');
    const updateWhere = sqlText(firstOf(dbMocks.updateChain.where.mock.calls)[0]);
    expect(updateWhere).toContain('"is_public" = ?');
    expect(updateWhere).toContain('"deleted_at" is null');
    expect(updateWhere).toContain('"user_id" = ?');
  });

  it('writes a share_revoked audit event only while the run is still shared, before the update so its guard sees the shared row', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    await stopSharing();

    expect(guardedInserts).toHaveLength(1);
    expect(firstOf(guardedInserts).values).toEqual(expect.objectContaining({
      action: 'checklist_run.share_revoked',
      resource_type: 'checklist_run',
      resource_id: 'run-1',
      actor_user_id: 'user-123',
    }));
    expect(JSON.stringify(firstOf(guardedInserts).values)).not.toContain('leaked-token');
    expect(sqlText(firstOf(guardedInserts).condition)).toContain('"is_public" = ?');
    const [firstStatement] = firstOf(dbMocks.db.batch.mock.calls)[0] as unknown[];
    expect(firstStatement).toEqual({ guardedInsert: 'checklist_run.share_revoked' });
  });

  it('lets an Organization runner stop sharing an Organization run', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedRun({ user_id: 'creator-1', team_id: 'team-1' })])
      .mockResolvedValueOnce([{ id: 'm-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }])
      .mockResolvedValueOnce([{ id: 'm-1', team_id: 'team-1', user_id: 'user-123', role: 'runner', status: 'active' }]);

    const { response } = await stopSharing();

    expect(response.status).toBe(200);
    expect(sqlText(firstOf(dbMocks.updateChain.where.mock.calls)[0])).toContain('"team_id" = ?');
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

    await expectStoppedPrivately();
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it('reports success when a concurrent request already stopped sharing', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    await expectStoppedPrivately();
  });

  it('points revalidation of a shared run at Stop sharing', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedRun()]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expected_revision: 4 }),
    }), mockEnv);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe('shared_run_conflict');
    expect(data.error).toMatch(/stop sharing/i);
  });
});
