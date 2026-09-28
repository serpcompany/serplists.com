import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

// A share token is a write credential for the run (PUT /api/checklists/shared/:token), so
// run reads must never return it. Otherwise a read-only Organization viewer could read the
// token from the runs list and edit a run they may not update directly.

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

import { schema } from '@functions/api/db';
import { handleChecklists } from '@functions/api/handlers/checklists';
import { checklistRunSelectFor, serializeChecklistRun } from '@functions/api/utils/checklist-runs';
import { getSessionUserId } from '@functions/api/utils/session';

const env = { DB: {}, BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
const SECRET = 'secret-share-token';
const SHARE_COLUMNS = ['share_token', 'share_expires_at', 'share_used_at'] as const;
const viewer = { id: 'member-1', team_id: 'team-1', user_id: 'viewer-1', role: 'viewer', status: 'active' };

function sharedTeamRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    user_id: 'runner-1',
    team_id: 'team-1',
    template_id: 'template-1',
    title: 'Shared Organization run',
    items: '[]',
    retired_items: '[]',
    status: 'in_progress',
    template_version: 1,
    revision: 1,
    is_public: true,
    share_token: SECRET,
    share_expires_at: '2026-01-01T00:00:00.000Z',
    share_used_at: '2026-01-02T00:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

async function get(path: string) {
  const response = await handleChecklists(new Request(`http://localhost/api/checklists${path}`), env);
  const text = await response.text();
  return { response, text, data: JSON.parse(text) as unknown };
}

function expectNoShareSecrets(run: unknown) {
  expect(run).toEqual(expect.objectContaining({ id: 'run-1', is_public: true }));
  for (const column of SHARE_COLUMNS) expect(run).not.toHaveProperty(column);
}

function expectSelectOmitsShareColumns() {
  const runSelects = dbMocks.db.select.mock.calls
    .map(([fields]) => fields)
    .filter((fields): fields is Record<string, unknown> => typeof fields === 'object' && fields !== null && 'is_public' in fields);
  expect(runSelects.length).toBeGreaterThan(0);
  for (const fields of runSelects) {
    for (const column of SHARE_COLUMNS) expect(fields).not.toHaveProperty(column);
  }
}

describe('run reads never return share tokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.selectChain.orderBy.mockReset();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockResolvedValue(undefined);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    vi.mocked(getSessionUserId).mockResolvedValue('viewer-1');
  });

  it('in the Organization runs list for a viewer', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([viewer]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([sharedTeamRun()]);

    const { response, text, data } = await get('?teamId=team-1');

    expect(response.status).toBe(200);
    expectNoShareSecrets((data as unknown[])[0]);
    expect(text).not.toContain(SECRET);
    expectSelectOmitsShareColumns();
  });

  it('in the run detail for a viewer', async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedTeamRun()])
      .mockResolvedValueOnce([viewer]);

    const { response, text, data } = await get('/run-1');

    expect(response.status).toBe(200);
    expectNoShareSecrets(data);
    expect(text).not.toContain(SECRET);
    expectSelectOmitsShareColumns();
  });

  it('in the archived Organization runs list', async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([viewer]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([sharedTeamRun({ deleted_at: '2026-01-03T00:00:00.000Z' })]);

    const { response, text, data } = await get('/archived?teamId=team-1');

    expect(response.status).toBe(200);
    expectNoShareSecrets((data as unknown[])[0]);
    expect(text).not.toContain(SECRET);
  });

  it('in the Personal runs list', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('runner-1');
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([sharedTeamRun({ team_id: null })]);

    const { response, text, data } = await get('');

    expect(response.status).toBe(200);
    expectNoShareSecrets((data as unknown[])[0]);
    expect(text).not.toContain(SECRET);
  });

  it('in the share-link read, which already holds the token', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    dbMocks.selectChain.limit.mockResolvedValueOnce([sharedTeamRun()]);

    const { response, data } = await get(`/shared/${SECRET}`);

    expect(response.status).toBe(200);
    expectNoShareSecrets(data);
  });

  it('in run history, including share_created events', async () => {
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedTeamRun()])
      .mockResolvedValueOnce([viewer])
      .mockResolvedValueOnce([{
        id: 'audit-1',
        actor_user_id: 'runner-1',
        action: 'checklist_run.share_created',
        diff_json: JSON.stringify({ is_public: true, share_token: SECRET, share_expires_at: 'x', share_used_at: null }),
        metadata_json: null,
        created_at: '2026-01-01T00:00:00.000Z',
      }]);

    const { response, text } = await get('/run-1/history');

    expect(response.status).toBe(200);
    expect(text).not.toContain(SECRET);
  });

  it('while the share endpoint still hands the link to a runner', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('runner-1');
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([sharedTeamRun({ is_public: false, share_token: null })])
      .mockResolvedValueOnce([{ ...viewer, user_id: 'runner-1', role: 'runner' }])
      .mockResolvedValueOnce([{ ...viewer, user_id: 'runner-1', role: 'runner' }]);

    const response = await handleChecklists(new Request('http://localhost/api/checklists/run/run-1/share', {
      method: 'POST',
      body: '{}',
    }), env);
    const data = await response.json() as { shareToken: string; sharePath: string };

    expect(response.status).toBe(200);
    expect(data.shareToken).toEqual(expect.any(String));
    expect(data.sharePath).toBe(`/share/${data.shareToken}`);
  });
});

describe('run response shape', () => {
  it('never selects the share columns', () => {
    for (const userId of ['user-1', null]) {
      const fields = checklistRunSelectFor(userId);
      for (const column of SHARE_COLUMNS) expect(fields).not.toHaveProperty(column);
      expect(fields).toHaveProperty('is_public');
    }
  });

  it('drops the share columns from a row that has every run column', () => {
    const row = Object.fromEntries(Object.keys(getTableColumns(schema.checklist_runs)).map((key) => [key, `value-${key}`]));

    const serialized = serializeChecklistRun(row);

    for (const column of SHARE_COLUMNS) expect(serialized).not.toHaveProperty(column);
    expect(serialized).toHaveProperty('is_public');
    expect(JSON.stringify(serialized)).not.toContain('value-share_');
  });
});
