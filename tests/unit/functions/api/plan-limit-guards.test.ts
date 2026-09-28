import { beforeEach, describe, expect, it, vi } from 'vitest';

// When the limit check inside a guarded write finds the context full (another request won
// the race), the handler must answer 403 limit_reached, never success.

const dbMocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn() };
  const insertChain = { values: vi.fn(), select: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
  };
  return { selectChain, insertChain, updateChain, db };
});

vi.mock('drizzle-orm/d1', () => ({ drizzle: vi.fn(() => dbMocks.db) }));
vi.mock('@functions/api/utils/session', () => ({ getSessionUserId: vi.fn() }));
vi.mock('@functions/api/utils/entitlements', () => ({
  getEntitlementsForUser: vi.fn(),
  getEntitlementsForContext: vi.fn(),
}));
vi.mock('@functions/api/utils/personal-run-key', () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from '@functions/api/handlers/agentMcp';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { handleTemplates } from '@functions/api/handlers/templates';
import { getEntitlementsForUser } from '@functions/api/utils/entitlements';
import { authenticatePersonalRunKey } from '@functions/api/utils/personal-run-key';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
const lostRace = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }];
const sections = [{ id: 's1', title: 'S', items: [{ id: 'i1', title: 'Task' }] }];

describe('limit-guarded writes that lose the race', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue({ kind: 'insert' });
    dbMocks.insertChain.select.mockReturnValue({ kind: 'guarded-insert' });
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue(lostRace);
    vi.mocked(getSessionUserId).mockResolvedValue('user-1');
    vi.mocked(getEntitlementsForUser).mockResolvedValue({ plan: 'free', limits: { maxTemplates: 1, maxActiveRuns: 3 } });
  });

  it('run create answers 403 and uses only guarded inserts', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ count: 2 }]) // pre-check passes
      .mockResolvedValueOnce([{ count: 3 }]); // after the lost race

    const response = await handleChecklists(new Request('http://localhost/api/checklists', {
      method: 'POST',
      body: JSON.stringify({ title: 'Run', sections }),
    }), env);
    const data = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(data).toEqual(expect.objectContaining({ code: 'limit_reached', details: { limit: 3, current: 3, resource: 'active_runs' } }));
    expect(dbMocks.db.batch.mock.calls[0][0]).toEqual([{ kind: 'guarded-insert' }, { kind: 'guarded-insert' }]);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('run restore answers 403 when the guarded update restores nothing at the limit', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'run-1', user_id: 'user-1', team_id: null, status: 'in_progress', deleted_at: '2026-01-01T00:00:00.000Z' }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 3 }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run-1/restore', { method: 'POST' }), env);

    expect(response.status).toBe(403);
    expect((await response.json() as Record<string, unknown>).code).toBe('limit_reached');
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it('template create answers 403 instead of returning the new id', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ count: 0 }]) // pre-check passes
      .mockResolvedValueOnce([]) // slug is free
      .mockResolvedValueOnce([{ count: 1 }]); // after the lost race

    const response = await handleTemplates(new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ title: 'Template', sections }),
    }), env);
    const data = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(data).toEqual(expect.objectContaining({ code: 'limit_reached', details: { limit: 1, current: 1, resource: 'templates' } }));
    expect(data).not.toHaveProperty('id');
    expect(dbMocks.db.batch.mock.calls[0][0]).toEqual([{ kind: 'guarded-insert' }, { kind: 'guarded-insert' }, { kind: 'guarded-insert' }]);
  });

  it('MCP start_run answers limit_reached', async () => {
    vi.mocked(authenticatePersonalRunKey).mockResolvedValue({ keyId: 'key-1', userId: 'user-1', name: 'Agent' });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([{ id: 'template-1', user_id: 'user-1', owner_type: 'user', team_id: null, deleted_at: null, title: 'SOP', items: JSON.stringify(sections), content_version: 1 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 3 }]);

    const response = await handleAgentMcp(new Request('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'start_run', arguments: { templateId: 'template-1' } } }),
    }), env);
    const body = await response.json() as any;

    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent).toEqual(expect.objectContaining({ error: 'limit_reached', details: { limit: 3, current: 3 } }));
  });
});
